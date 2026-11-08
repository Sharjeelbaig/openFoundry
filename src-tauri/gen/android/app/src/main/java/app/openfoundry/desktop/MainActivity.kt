package app.openfoundry.desktop

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.enableEdgeToEdge
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.zip.ZipInputStream
import kotlin.concurrent.thread

class MainActivity : TauriActivity() {
  companion object {
    private const val TAG = "openFoundry"
    private const val PORT = 31337
    private const val ORIGIN = "http://127.0.0.1:$PORT"
    private const val HEALTH_URL = "$ORIGIN/api/health"
    private const val BRIDGE_NAME = "OpenFoundryHost"

    private val serverLock = Any()

    @Volatile private var server: Process? = null
    @Volatile private var serverSupervisor: Thread? = null
    @Volatile private var serverWanted = false
  }

  private var webView: WebView? = null

  private val connectionLock = Any()
  private var connectionThread: Thread? = null

  @Volatile private var alive = false
  @Volatile private var lastBootDetail: String? = null

  private var splashUrl: String? = null
  private var splashReady = false
  private var workspaceLoaded = false
  private var pendingStatus: String? = null
  private var pendingError: String? = null
  private var pendingErrorDetail: String? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    alive = true
    serverWanted = true
    ensureServerSupervisor()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
    webView.addJavascriptInterface(HostBridge(), BRIDGE_NAME)
    // Tauri installs its own WebViewClient after this callback returns, and
    // starts the initial page load before that. Wrap the real client on the
    // next main-thread turns instead of capturing whatever is there now.
    installErrorHandling(webView, 0)
    startConnection()
  }

  override fun onDestroy() {
    alive = false
    webView = null
    if (isFinishing && !isChangingConfigurations) {
      serverWanted = false
      val process = synchronized(serverLock) { server }
      if (process != null) {
        process.destroy()
        thread(name = "openfoundry-server-stop", isDaemon = true) {
          try {
            process.waitFor()
          } catch (_: InterruptedException) {
            // The process group is going away.
          }
        }
      }
    }
    super.onDestroy()
  }

  // --- Server supervision -------------------------------------------------

  private fun ensureServerSupervisor() {
    synchronized(serverLock) {
      if (serverSupervisor?.isAlive == true) return
      serverSupervisor = thread(name = "openfoundry-server", isDaemon = true) {
        superviseServer()
      }
    }
  }

  /**
   * Keep Node alive for as long as this app wants a workspace.
   *
   * The old shell started the server exactly once: a crash left the WebView on
   * a browser error page until the user reinstalled. Each exit now restarts
   * the process with a short backoff, up to five quick failures in a row.
   */
  private fun superviseServer() {
    var quickFailures = 0
    while (serverWanted) {
      var process: Process? = null
      val startedAt = System.currentTimeMillis()
      try {
        process = launchServer()
        synchronized(serverLock) { server = process }
        process.inputStream.bufferedReader().use { reader ->
          reader.forEachLine { line -> Log.i(TAG, line) }
        }
        Log.i(TAG, "Local server exited with code ${process.waitFor()}")
      } catch (error: Throwable) {
        Log.e(TAG, "Could not start the local server", error)
      } finally {
        synchronized(serverLock) {
          if (server === process) server = null
        }
      }
      if (!serverWanted) break

      if (System.currentTimeMillis() - startedAt < 10_000) {
        quickFailures += 1
      } else {
        quickFailures = 0
      }
      if (quickFailures > 5) {
        Log.e(TAG, "The local server keeps exiting; waiting for a retry")
        break
      }
      try {
        Thread.sleep(minOf(1000L * (quickFailures + 1), 5000L))
      } catch (_: InterruptedException) {
        break
      }
    }
  }

  private fun launchServer(): Process {
    val context = applicationContext
    val root = File(context.filesDir, "openfoundry")
    val serverDir = File(root, "server")

    // Re-extract when the install changes, so an app update never keeps
    // serving a previous version's server from this directory.
    val stampFile = File(root, "server.stamp")
    val stamp = installStamp()
    val currentStamp = if (stampFile.exists()) stampFile.readText().trim() else ""
    if (!File(serverDir, "server.js").exists() || currentStamp != stamp) {
      Log.i(TAG, "Extracting local server ($stamp)")
      extractAsset("openfoundry-server.zip", serverDir)
      stampFile.writeText(stamp)
    }

    val dataDir = File(root, "data")
    dataDir.mkdirs()
    stopStaleServer(dataDir, serverDir)

    val node = File(context.applicationInfo.nativeLibraryDir, "libnode.so")
    if (!node.exists()) {
      throw IllegalStateException("Node runtime missing: ${node.absolutePath}")
    }
    node.setExecutable(true)

    val builder = ProcessBuilder(node.absolutePath, "server.js")
    builder.directory(serverDir)
    builder.redirectErrorStream(true)
    val runtimeLib = File(serverDir, "runtime/lib")
    val llamaLib = File(serverDir, "runtime/llama/lib")
    val caBundle = buildCaBundle(root)
    builder.environment().apply {
      put("LD_LIBRARY_PATH", runtimeLib.absolutePath)
      put("NODE_ENV", "production")
      put("PORT", PORT.toString())
      put("HOSTNAME", "127.0.0.1")
      put("OPENFOUNDRY_DATA_DIR", dataDir.absolutePath)
      put("OPENFOUNDRY_PUBLIC_URL", ORIGIN)
      put("OPENFOUNDRY_VOICE_WS_PORT", "31338")
      put("HOME", root.absolutePath)
      put("TMPDIR", context.cacheDir.absolutePath)
      // The bundled llama.cpp runtime. libllamaserver.so is the llama-server
      // executable, extracted next to libnode.so by Android; its shared
      // objects are loaded from the app's private directory.
      put("OPENFOUNDRY_NATIVE_LIB_DIR", context.applicationInfo.nativeLibraryDir)
      put("OPENFOUNDRY_LLAMA_SERVER", File(context.applicationInfo.nativeLibraryDir, "libllamaserver.so").absolutePath)
      put("OPENFOUNDRY_LLAMA_LIB_DIR", llamaLib.absolutePath)
      // Node on Android ships no root certificates of its own, so HTTPS
      // requests fail with "unable to get local issuer certificate". Point
      // it at a bundle built from the device's own trust store instead.
      if (caBundle != null) {
        put("NODE_EXTRA_CA_CERTS", caBundle)
        put("SSL_CERT_FILE", caBundle)
      }
    }
    val process = builder.start()
    Log.i(TAG, "Local server started on $ORIGIN")
    return process
  }

  /**
   * Kill a Node process that survived the previous app process.
   *
   * The server writes its own PID file on boot — Android cannot ask
   * `java.lang.Process` for a child's PID. The file is only trusted when
   * `/proc` proves it still runs `server.js` from this install's server
   * directory; anything else is a recycled PID and must be left alone.
   */
  private fun stopStaleServer(dataDir: File, serverDir: File) {
    val file = File(dataDir, "server.pid")
    if (!file.exists()) return
    val pid = file.readText().trim().toIntOrNull()
    file.delete()
    if (pid == null || pid <= 0 || pid == android.os.Process.myPid()) return

    val cmdline = readProc(pid, "cmdline") ?: return
    if (!cmdline.contains("server.js")) return
    val cwd = try {
      File("/proc/$pid/cwd").canonicalPath
    } catch (_: Throwable) {
      null
    } ?: return
    if (cwd != serverDir.canonicalPath) return

    Log.w(TAG, "Stopping a local server left by a previous launch (pid $pid)")
    android.os.Process.killProcess(pid)
    try {
      Thread.sleep(300)
    } catch (_: InterruptedException) {
      // Continue with the new server.
    }
  }

  private fun readProc(pid: Int, name: String): String? {
    return try {
      File("/proc/$pid/$name").readText()
    } catch (_: Throwable) {
      null
    }
  }

  // --- Startup gate -------------------------------------------------------

  private fun startConnection() {
    synchronized(connectionLock) {
      if (!alive) return
      serverWanted = true
      ensureServerSupervisor()
      if (connectionThread?.isAlive == true) return
      connectionThread = thread(name = "openfoundry-connect", isDaemon = true) {
        connectionLoop()
      }
    }
  }

  private fun connectionLoop() {
    try {
      if (!awaitServer(120_000)) {
        showSplashError(
          "The local server did not start.",
          lastBootDetail ?: "No response from 127.0.0.1:$PORT."
        )
        return
      }

      postStatus("Signing in…")
      if (!awaitMachineKey(30_000)) {
        showSplashError(
          "The workspace is not ready.",
          "The machine key was not created."
        )
        return
      }
      if (!awaitSignIn(30_000)) {
        showSplashError(
          "Could not sign in.",
          "The machine credential was rejected."
        )
        return
      }

      postStatus("Opening your workspace…")
      openWorkspace()
      watchServer()
    } catch (_: InterruptedException) {
      // The activity is going away.
    } catch (error: Throwable) {
      Log.e(TAG, "Startup failed", error)
      showSplashError("openFoundry could not start.", error.message)
    } finally {
      synchronized(connectionLock) {
        if (connectionThread === Thread.currentThread()) connectionThread = null
      }
    }
  }

  /**
   * Poll `/api/health` until storage, the owner directory and the machine key
   * are ready. A listening port is not the same as a usable install.
   */
  private fun awaitServer(timeoutMs: Long): Boolean {
    val deadline = System.currentTimeMillis() + timeoutMs
    postStatus("Starting the local server…")
    var slowAnnounced = false
    while (alive && System.currentTimeMillis() < deadline) {
      val detail = probeHealth()
      if (detail == null) return true
      lastBootDetail = detail
      if (!slowAnnounced && System.currentTimeMillis() > deadline - timeoutMs + 20_000) {
        slowAnnounced = true
        postStatus("Still starting the local server…")
      }
      Thread.sleep(400)
    }
    return alive && probeHealth() == null
  }

  /** null means healthy; otherwise a short diagnostic for the splash. */
  private fun probeHealth(): String? {
    return try {
      val connection = URL(HEALTH_URL).openConnection() as HttpURLConnection
      connection.requestMethod = "GET"
      connection.connectTimeout = 1500
      connection.readTimeout = 1500
      connection.useCaches = false
      val code = connection.responseCode
      val body = if (code == 200) {
        null
      } else {
        connection.errorStream?.bufferedReader()?.use { reader ->
          reader.readText().take(600)
        }
      }
      connection.disconnect()
      when {
        code == 200 -> null
        body.isNullOrBlank() -> "HTTP $code"
        else -> bootError(body) ?: "HTTP $code"
      }
    } catch (error: Throwable) {
      error.message ?: "The server is not listening yet."
    }
  }

  /** Read `boot.error` out of the health payload without requiring JSON. */
  private fun bootError(body: String): String? {
    return try {
      val parsed = JSONObject(body).optJSONObject("boot")?.optString("error")?.trim()
      if (!parsed.isNullOrEmpty()) parsed else body.take(300)
    } catch (_: Throwable) {
      body.take(300)
    }
  }

  private fun awaitMachineKey(timeoutMs: Long): Boolean {
    val keyFile = File(File(filesDir, "openfoundry"), "data/machine.key")
    val deadline = System.currentTimeMillis() + timeoutMs
    while (alive && System.currentTimeMillis() < deadline) {
      if (keyFile.exists() && keyFile.readText().trim().isNotEmpty()) return true
      Thread.sleep(250)
    }
    return keyFile.exists() && keyFile.readText().trim().isNotEmpty()
  }

  private fun awaitSignIn(timeoutMs: Long): Boolean {
    val deadline = System.currentTimeMillis() + timeoutMs
    while (alive && System.currentTimeMillis() < deadline) {
      if (signIn()) return true
      Thread.sleep(500)
    }
    return signIn()
  }

  /** Sign in with the machine key before the workspace is ever loaded. */
  private fun signIn(): Boolean {
    val key = try {
      val keyFile = File(File(filesDir, "openfoundry"), "data/machine.key")
      keyFile.readText().trim().ifEmpty { null }
    } catch (_: Throwable) {
      null
    } ?: return false

    return try {
      val url = URL("$ORIGIN/api/auth/machine?key=" + URLEncoder.encode(key, "UTF-8"))
      val connection = url.openConnection() as HttpURLConnection
      connection.instanceFollowRedirects = false
      connection.connectTimeout = 2000
      connection.readTimeout = 2000
      val code = connection.responseCode
      val session = connection.headerFields["Set-Cookie"].orEmpty()
        .firstOrNull { it.startsWith("of_session=") }
        ?.substringBefore(";")
      connection.disconnect()
      if (code in 200..399 && session != null) {
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setCookie(ORIGIN, session)
        CookieManager.getInstance().flush()
        Log.i(TAG, "Machine sign-in complete")
        true
      } else {
        Log.w(TAG, "Machine sign-in returned HTTP $code")
        false
      }
    } catch (error: Throwable) {
      Log.w(TAG, "Machine sign-in failed: ${error.message}")
      false
    }
  }

  private fun openWorkspace() {
    // Called from the connection thread: every WebView read and write has to
    // happen inside the posted block, on the main thread.
    val view = webView ?: return
    view.post {
      val current = view.url
      if (splashUrl == null && current != null && isSplashUrl(current)) {
        splashUrl = current
      }
      if (!workspaceLoaded) {
        view.loadUrl("$ORIGIN/")
      } else {
        view.reload()
      }
    }
  }

  /**
   * After the workspace is open, a Node restart must not leave a dead page.
   * Wait for health to return, refresh the session, then reload.
   */
  private fun watchServer() {
    var failures = 0
    while (alive) {
      Thread.sleep(3000)
      if (!alive) return
      if (probeHealth() == null) {
        failures = 0
        continue
      }
      failures += 1
      if (failures < 2) continue

      Log.w(TAG, "The local server stopped answering; waiting for it to recover")
      val downSince = System.currentTimeMillis()
      while (alive && probeHealth() != null) {
        if (System.currentTimeMillis() - downSince > 30_000) {
          showSplashError(
            "Lost the local server.",
            "openFoundry is restarting it. Try again in a moment."
          )
          return
        }
        Thread.sleep(1000)
      }
      if (!alive) return

      if (!awaitMachineKey(10_000) || !awaitSignIn(15_000)) {
        Thread.sleep(2000)
        continue
      }
      webView?.post { webView?.reload() }
      failures = 0
    }
  }

  // --- Splash -------------------------------------------------------------

  private fun isSplashUrl(url: String): Boolean {
    if (url.startsWith(ORIGIN)) return false
    if (!url.startsWith("http://") && !url.startsWith("https://")) return false
    val host = try {
      URL(url).host
    } catch (_: Throwable) {
      return false
    } ?: return false
    // Tauri serves the shell from a custom-protocol host such as
    // `tauri.localhost`; the asset loader uses `<name>.assets`.
    return host == "tauri.localhost" || host.endsWith(".localhost") || host.endsWith(".assets")
  }

  private fun postStatus(message: String) {
    pendingStatus = message
    pendingError = null
    pendingErrorDetail = null
    flushSplashState()
  }

  private fun showSplashError(message: String, detail: String?) {
    pendingStatus = null
    pendingError = message
    pendingErrorDetail = detail
    val view = webView ?: return
    view.post {
      val target = splashUrl
      if (target != null && view.url != target) {
        splashReady = false
        view.loadUrl(target)
      } else {
        flushSplashState()
      }
    }
  }

  private fun flushSplashState() {
    if (!splashReady) return
    val view = webView ?: return
    val status = pendingStatus
    val error = pendingError
    val detail = pendingErrorDetail
    view.post {
      val target = webView ?: return@post
      try {
        if (error != null) {
          target.evaluateJavascript(
            "window.__openFoundry && window.__openFoundry.setError(${quote(error)}, ${quote(detail ?: "")})",
            null
          )
        } else if (status != null) {
          target.evaluateJavascript(
            "window.__openFoundry && window.__openFoundry.setStatus(${quote(status)})",
            null
          )
        }
      } catch (error: Throwable) {
        Log.w(TAG, "Could not update the splash", error)
      }
    }
  }

  private fun quote(value: String): String = JSONObject.quote(value)

  private fun handlePageStarted(url: String) {
    if (isSplashUrl(url)) {
      splashUrl = url
      splashReady = false
    } else if (url.startsWith(ORIGIN)) {
      splashReady = false
    }
  }

  private fun handlePageFinished(url: String) {
    if (isSplashUrl(url)) {
      splashUrl = url
      splashReady = true
      flushSplashState()
      return
    }
    if (url.startsWith(ORIGIN) && !workspaceLoaded) {
      workspaceLoaded = true
      webView?.clearHistory()
      Log.i(TAG, "Workspace loaded")
    }
  }

  // --- WebView client wrapper --------------------------------------------

  /**
   * Tauri's generated client must keep receiving every callback. The wrapper
   * only replaces the default browser error page for the local workspace.
   */
  private inner class HostWebViewClient(
    private val delegate: WebViewClient
  ) : WebViewClient() {
    override fun shouldInterceptRequest(
      view: WebView,
      request: WebResourceRequest
    ): WebResourceResponse? = delegate.shouldInterceptRequest(view, request)

    override fun shouldOverrideUrlLoading(
      view: WebView,
      request: WebResourceRequest
    ): Boolean = delegate.shouldOverrideUrlLoading(view, request)

    override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
      delegate.onPageStarted(view, url, favicon)
      handlePageStarted(url)
    }

    override fun onPageFinished(view: WebView, url: String) {
      delegate.onPageFinished(view, url)
      handlePageFinished(url)
    }

    override fun onReceivedError(
      view: WebView,
      request: WebResourceRequest,
      error: WebResourceError
    ) {
      if (request.isForMainFrame && request.url.toString().startsWith(ORIGIN)) {
        Log.e(TAG, "Workspace load failed (${error.errorCode}): ${error.description}")
        view.stopLoading()
        showSplashError(
          "Could not open the workspace.",
          "The local server did not answer (${error.description})."
        )
        return
      }
      delegate.onReceivedError(view, request, error)
    }

    override fun onReceivedHttpError(
      view: WebView,
      request: WebResourceRequest,
      response: WebResourceResponse
    ) {
      if (request.isForMainFrame &&
        request.url.toString().startsWith(ORIGIN) &&
        response.statusCode >= 500
      ) {
        Log.e(TAG, "Workspace returned HTTP ${response.statusCode}")
        view.stopLoading()
        showSplashError(
          "Could not open the workspace.",
          "The local server returned HTTP ${response.statusCode}."
        )
        return
      }
      delegate.onReceivedHttpError(view, request, response)
    }
  }

  @SuppressLint("NewApi")
  private fun installErrorHandling(webView: WebView, attempt: Int) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      Log.w(TAG, "Error interception needs Android 8.0 or newer")
      return
    }
    val client = webView.webViewClient
    if (client is RustWebViewClient) {
      webView.webViewClient = HostWebViewClient(client)
      val current = webView.url
      if (current != null && isSplashUrl(current)) {
        splashUrl = current
        // If the splash already finished, its DOM is ready; if it is still
        // loading, onPageFinished will flush again.
        splashReady = true
        flushSplashState()
      }
      return
    }
    if (attempt < 50) {
      webView.postDelayed({ installErrorHandling(webView, attempt + 1) }, 20)
    } else {
      Log.w(TAG, "Tauri's WebView client did not appear; error interception is off")
    }
  }

  private inner class HostBridge {
    @JavascriptInterface
    fun retry() {
      // This runs on the JavaScript bridge thread, where the WebView itself
      // must not be touched.
      val view = webView ?: return
      view.post {
        val current = view.url ?: return@post
        if (!isSplashUrl(current)) return@post
        Log.i(TAG, "Retry requested from the splash")
        startConnection()
      }
    }
  }

  // --- Device plumbing ----------------------------------------------------

  /**
   * Concatenate the device's PEM trust anchors into one bundle Node can read.
   *
   * Android keeps the system roots in the conscrypt APEX and mirrors them
   * under /system; user-installed roots land in the same directories. Both are
   * world-readable, so the app can assemble a bundle on every launch and pick
   * up any change to the device trust store for free.
   */
  private fun buildCaBundle(root: File): String? {
    val sources = listOf(
      File("/apex/com.android.conscrypt/cacerts"),
      File("/system/etc/security/cacerts")
    )
    val seen = HashSet<String>()
    val target = File(root, "ca-bundle.pem")
    var count = 0
    try {
      target.outputStream().buffered().use { out ->
        for (dir in sources) {
          val files = dir.listFiles() ?: continue
          for (file in files) {
            if (!file.isFile) continue
            if (!seen.add(file.name)) continue
            try {
              val bytes = file.readBytes()
              out.write(bytes)
              if (bytes.isNotEmpty() && bytes.last() != '\n'.code.toByte()) out.write('\n'.code)
              count++
            } catch (_: Throwable) {
              // A certificate we cannot read is not fatal.
            }
          }
        }
      }
    } catch (error: Throwable) {
      Log.w(TAG, "Could not build a CA bundle", error)
      return null
    }
    if (count == 0) {
      Log.w(TAG, "No system certificates were found for the CA bundle")
      return null
    }
    Log.i(TAG, "CA bundle ready with $count certificates at ${target.absolutePath}")
    return target.absolutePath
  }

  /** A value that changes on every install: the APK's last update time. */
  private fun installStamp(): String {
    return try {
      @Suppress("DEPRECATION")
      val info = applicationContext.packageManager.getPackageInfo(
        applicationContext.packageName,
        0
      )
      info.lastUpdateTime.toString()
    } catch (error: Throwable) {
      Log.w(TAG, "Could not read the install time", error)
      "0"
    }
  }

  private fun extractAsset(assetName: String, target: File) {
    target.deleteRecursively()
    target.mkdirs()
    val rootPath = target.canonicalPath + File.separator
    applicationContext.assets.open(assetName).use { input ->
      ZipInputStream(input).use { zip ->
        while (true) {
          val entry = zip.nextEntry ?: break
          val output = File(target, entry.name)
          if (!output.canonicalPath.startsWith(rootPath)) {
            throw SecurityException("Invalid asset path: ${entry.name}")
          }
          if (entry.isDirectory) {
            output.mkdirs()
          } else {
            output.parentFile?.mkdirs()
            output.outputStream().use { out -> zip.copyTo(out) }
          }
          zip.closeEntry()
        }
      }
    }
  }
}
