package com.example.yantudaibei

import android.net.Uri
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import com.google.mlkit.vision.text.latin.TextRecognizerOptions

class LocalOcrModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "LocalOcr"

  @ReactMethod
  fun recognizeText(imageUri: String, promise: Promise) {
    if (imageUri.isBlank()) {
      promise.reject("E_OCR_INPUT", "图片地址为空")
      return
    }

    val uri = Uri.parse(imageUri)
    val scheme = uri.scheme
    if (scheme != "file" && scheme != "content") {
      promise.reject("E_OCR_INPUT", "暂不支持此图片地址")
      return
    }

    val image = try {
      InputImage.fromFilePath(reactContext, uri)
    } catch (error: Exception) {
      promise.reject("E_OCR_INPUT", "无法读取图片", error)
      return
    }

    val chineseRecognizer = TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build())
    val latinRecognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

    chineseRecognizer.process(image)
      .addOnSuccessListener { chineseText ->
        latinRecognizer.process(image)
          .addOnSuccessListener { latinText ->
            resolveRecognizedText(promise, listOf(chineseText.text, latinText.text))
          }
          .addOnFailureListener {
            resolveRecognizedText(promise, listOf(chineseText.text))
          }
          .addOnCompleteListener {
            latinRecognizer.close()
            chineseRecognizer.close()
          }
      }
      .addOnFailureListener { chineseError ->
        latinRecognizer.process(image)
          .addOnSuccessListener { latinText ->
            resolveRecognizedText(promise, listOf(latinText.text))
          }
          .addOnFailureListener { latinError ->
            promise.reject("E_OCR_FAILED", "图片识别失败", latinError ?: chineseError)
          }
          .addOnCompleteListener {
            latinRecognizer.close()
            chineseRecognizer.close()
          }
      }
  }

  private fun resolveRecognizedText(promise: Promise, values: List<String>) {
    val text = mergeText(values)
    if (text.isBlank()) {
      promise.reject("E_OCR_EMPTY", "未识别到文字")
      return
    }
    promise.resolve(text)
  }

  private fun mergeText(values: List<String>): String {
    val seen = LinkedHashSet<String>()
    values
      .flatMap { it.lines() }
      .map { it.trim() }
      .filter { it.isNotEmpty() }
      .forEach { seen.add(it) }
    return seen.joinToString("\n")
  }
}
