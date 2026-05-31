package com.example.yantudaibei

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.Locale

class LocalSpeechModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext),
  LifecycleEventListener {

  private val mainHandler = Handler(Looper.getMainLooper())
  private val pending = mutableListOf<Pair<String, Promise>>()
  private var engine: TextToSpeech? = null
  private var initializing = false
  private var ready = false

  init {
    reactContext.addLifecycleEventListener(this)
  }

  override fun getName() = "LocalSpeech"

  @ReactMethod
  fun speak(text: String, promise: Promise) {
    val trimmed = text.trim()
    if (trimmed.isBlank()) {
      promise.reject("E_SPEECH_INPUT", "朗读内容为空")
      return
    }

    mainHandler.post {
      ensureEngine(trimmed.take(MAX_SPEECH_CHARS), promise)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    mainHandler.post {
      engine?.stop()
      promise.resolve(null)
    }
  }

  private fun ensureEngine(text: String, promise: Promise) {
    val current = engine
    if (current != null && ready) {
      speakNow(current, text, promise)
      return
    }

    pending.add(Pair(text, promise))
    if (initializing) return

    initializing = true
    engine = TextToSpeech(reactContext.applicationContext) { status ->
      mainHandler.post {
        initializing = false
        if (status == TextToSpeech.SUCCESS) {
          ready = true
          engine?.language = Locale.getDefault()
          flushPending()
        } else {
          ready = false
          rejectPending("E_SPEECH_INIT", "本机朗读引擎不可用")
        }
      }
    }
  }

  private fun flushPending() {
    val current = engine
    val queued = pending.toList()
    pending.clear()
    if (current == null) {
      queued.forEach { it.second.reject("E_SPEECH_INIT", "本机朗读引擎不可用") }
      return
    }
    queued.forEach { speakNow(current, it.first, it.second) }
  }

  private fun rejectPending(code: String, message: String) {
    val queued = pending.toList()
    pending.clear()
    queued.forEach { it.second.reject(code, message) }
  }

  private fun speakNow(tts: TextToSpeech, text: String, promise: Promise) {
    val params = Bundle()
    val result = tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, "review-${System.currentTimeMillis()}")
    if (result == TextToSpeech.ERROR) {
      promise.reject("E_SPEECH_FAILED", "朗读失败")
    } else {
      promise.resolve(null)
    }
  }

  private fun releaseEngine() {
    pending.clear()
    ready = false
    initializing = false
    engine?.stop()
    engine?.shutdown()
    engine = null
  }

  override fun onHostResume() = Unit

  override fun onHostPause() {
    engine?.stop()
  }

  override fun onHostDestroy() {
    releaseEngine()
  }

  override fun invalidate() {
    releaseEngine()
    reactContext.removeLifecycleEventListener(this)
    super.invalidate()
  }

  companion object {
    private const val MAX_SPEECH_CHARS = 900
  }
}
