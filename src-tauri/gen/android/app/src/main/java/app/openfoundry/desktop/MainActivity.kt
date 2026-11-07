package app.openfoundry.desktop

import android.os.Bundle
import android.util.Log
import android.webkit.CookieManager
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
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
    private var server: Process? = null
  }

  private var webView: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    startLocalServer()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
    thread(name = "openfoundry-signin", isDaemon = true) {
      openWhenReady()
    }
  }

  override fun onDestroy() {
    server?.let {
      it.destroy()
      it.waitFor()
    }
    server = null
    webView = null
    super.onDestroy()
  }

  private fun startLocalServer() {
    if (server?.isAlive == true) return
    thread(name = "openfoundry-server", isDaemon = true) {
      try {
        val root = File(filesDir, "openfoundry")
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

        val node = File(applicationInfo.nativeLibraryDir, "libnode.so")
        if (!node.exists()) {
          Log.e(TAG, "Node runtime missing: ${node.absolutePath}")
          return@thread
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
          put("TMPDIR", cacheDir.absolutePath)
          // The bundled llama.cpp runtime. libllamaserver.so is the llama-server
          // executable, extracted next to libnode.so by Android; its shared
          // objects are loaded from the app's private directory.
          put("OPENFOUNDRY_NATIVE_LIB_DIR", applicationInfo.nativeLibraryDir)
          put("OPENFOUNDRY_LLAMA_SERVER", File(applicationInfo.nativeLibraryDir, "libllamaserver.so").absolutePath)
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
        server = process
        Log.i(TAG, "Local server started on $ORIGIN")
        process.inputStream.bufferedReader().forEachLine { line ->
          Log.i(TAG, line)
        }
        Log.i(TAG, "Local server exited: ${process.exitValue()}")
      } catch (error: Throwable) {
        Log.e(TAG, "Could not start the local server", error)
      }
    }
  }

  /** Sign in with the machine key before showing the workspace. */
  private fun openWhenReady() {
    val root = File(filesDir, "openfoundry")
    val keyFile = File(root, "data/machine.key")
    var key: String? = null
    for (attempt in 0 until 120) {
      if (keyFile.exists()) {
        key = keyFile.readText().trim().ifEmpty { null }
        if (key != null) break
      }
      Thread.sleep(250)
    }
    if (key == null) {
      Log.e(TAG, "machine.key was not created")
      openWorkspace()
      return
    }

    for (attempt in 0 until 40) {
      try {
        val url = URL("$ORIGIN/api/auth/machine?key=" + URLEncoder.encode(key, "UTF-8"))
        val connection = url.openConnection() as HttpURLConnection
        connection.instanceFollowRedirects = false
        connection.connectTimeout = 1500
        connection.readTimeout = 1500
        val code = connection.responseCode
        val cookies = connection.headerFields["Set-Cookie"].orEmpty()
        val session = cookies.firstOrNull { it.startsWith("of_session=") }
          ?.substringBefore(";")
        if (code in 200..399 && session != null) {
          CookieManager.getInstance().setCookie(ORIGIN, session)
          CookieManager.getInstance().flush()
          Log.i(TAG, "Machine sign-in complete")
          openWorkspace()
          return
        }
      } catch (_: Throwable) {
        // Server is still starting.
      }
      Thread.sleep(500)
    }
    Log.e(TAG, "Machine sign-in did not complete")
    openWorkspace()
  }

  private fun openWorkspace() {
    webView?.post {
      webView?.loadUrl("$ORIGIN/")
    }
  }

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
      packageManager.getPackageInfo(packageName, 0).lastUpdateTime.toString()
    } catch (error: Throwable) {
      Log.w(TAG, "Could not read the install time", error)
      "0"
    }
  }

  private fun extractAsset(assetName: String, target: File) {
    target.deleteRecursively()
    target.mkdirs()
    val rootPath = target.canonicalPath + File.separator
    assets.open(assetName).use { input ->
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
