package com.example.yantudaibei

import android.net.Uri
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.rendering.ImageType
import com.tom_roush.pdfbox.rendering.PDFRenderer
import com.tom_roush.pdfbox.text.PDFTextStripper

class LocalPdfModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "LocalPdf"

  @ReactMethod
  fun extractText(pdfUri: String, promise: Promise) {
    if (pdfUri.isBlank()) {
      promise.reject("E_PDF_INPUT", "PDF 地址为空")
      return
    }

    val uri = Uri.parse(pdfUri)
    val scheme = uri.scheme
    if (scheme != "file" && scheme != "content") {
      promise.reject("E_PDF_INPUT", "暂不支持此 PDF 地址")
      return
    }

    Thread {
      extractTextInBackground(uri, promise)
    }.start()
  }

  private fun extractTextInBackground(uri: Uri, promise: Promise) {
    try {
      val size = knownSize(uri)
      if (size != null && size > MAX_PDF_BYTES) {
        throw LocalPdfException("E_PDF_TOO_LARGE", "PDF 文件过大")
      }

      PDFBoxResourceLoader.init(reactContext.applicationContext)
      val input = reactContext.contentResolver.openInputStream(uri)
      if (input == null) {
        throw LocalPdfException("E_PDF_INPUT", "无法读取 PDF")
      }

      input.use { stream ->
        val document = PDDocument.load(stream)
        try {
          if (document.isEncrypted) {
            throw LocalPdfException("E_PDF_ENCRYPTED", "加密 PDF 暂不支持")
          }

          val pages = document.numberOfPages
          if (pages <= 0) {
            throw LocalPdfException("E_PDF_EMPTY", "PDF 没有可读取页面")
          }

          val textLayer = extractTextLayer(document, pages)
          val text = if (textLayer.length >= MIN_USABLE_TEXT_CHARS) textLayer else mergeText(listOf(textLayer, extractTextByOcr(document, pages)))

          if (text.isBlank()) {
            throw LocalPdfException("E_PDF_NO_TEXT", "这个 PDF 没有可提取文本，请换更清晰的文件")
          }

          promise.resolve(limitBridgeText(text))
        } finally {
          document.close()
        }
      }
    } catch (error: LocalPdfException) {
      promise.reject(error.code, error.message)
    } catch (error: Exception) {
      promise.reject("E_PDF_FAILED", "PDF 解析失败", error)
    }
  }

  private fun extractTextLayer(document: PDDocument, pages: Int): String {
    val stripper = PDFTextStripper()
    stripper.sortByPosition = true
    stripper.endPage = minOf(pages, MAX_PDF_PAGES)
    return stripper.getText(document).trim()
  }

  private fun extractTextByOcr(document: PDDocument, pages: Int): String {
    val renderer = PDFRenderer(document)
    val chineseRecognizer = TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build())
    val latinRecognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

    return try {
      val parts = mutableListOf<String>()
      val pageLimit = minOf(pages, MAX_PDF_OCR_PAGES)
      for (pageIndex in 0 until pageLimit) {
        val bitmap = renderer.renderImage(pageIndex, PDF_OCR_SCALE, ImageType.RGB)
        try {
          val pageText = recognizeBitmap(bitmap, chineseRecognizer, latinRecognizer)
          if (pageText.isNotBlank()) {
            parts.add("第 ${pageIndex + 1} 页\n$pageText")
          }
        } finally {
          bitmap.recycle()
        }
      }
      parts.joinToString("\n\n").trim()
    } finally {
      chineseRecognizer.close()
      latinRecognizer.close()
    }
  }

  private fun recognizeBitmap(
    bitmap: android.graphics.Bitmap,
    chineseRecognizer: TextRecognizer,
    latinRecognizer: TextRecognizer
  ): String {
    val image = InputImage.fromBitmap(bitmap, 0)
    val recognized = mutableListOf<String>()

    try {
      recognized.add(Tasks.await(chineseRecognizer.process(image)).text)
    } catch (_: Exception) {
      // Latin recognition can still recover useful English/numeric text.
    }

    try {
      recognized.add(Tasks.await(latinRecognizer.process(image)).text)
    } catch (_: Exception) {
      // A blank page or unsupported image should not fail the whole PDF import.
    }

    return mergeText(recognized)
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

  private fun limitBridgeText(text: String): String =
    if (text.length > MAX_BRIDGE_TEXT_CHARS) text.take(MAX_BRIDGE_TEXT_CHARS) else text

  private fun knownSize(uri: Uri): Long? {
    return try {
      reactContext.contentResolver.openAssetFileDescriptor(uri, "r")?.use { descriptor ->
        descriptor.length.takeIf { it >= 0 }
      }
    } catch (_: Exception) {
      null
    }
  }

  companion object {
    private const val MAX_PDF_BYTES = 15L * 1024L * 1024L
    private const val MAX_PDF_PAGES = 80
    private const val MAX_PDF_OCR_PAGES = 12
    private const val MAX_BRIDGE_TEXT_CHARS = 120000
    private const val MIN_USABLE_TEXT_CHARS = 20
    private const val PDF_OCR_SCALE = 1.6f
  }

  private class LocalPdfException(val code: String, override val message: String) : Exception(message)
}
