// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    openfoundry_lib::run()
}
