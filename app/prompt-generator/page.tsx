"use client"

import { useState, useRef, useCallback } from "react"
import Link from "next/link"

interface AnalysisResult {
  productDescription: string
  generationPrompt: string
}

interface ImageResult {
  fileName: string
  success: boolean
  error?: string
  analysis: AnalysisResult | null
  previewUrl: string
}

export default function PromptGeneratorPage() {
  // Upload state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Analysis state
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState("")
  const [currentIndex, setCurrentIndex] = useState(0)
  const [results, setResults] = useState<ImageResult[]>([])

  // Editable prompts state
  const [editedPrompts, setEditedPrompts] = useState<Record<string, string>>({})

  // Save modal state
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [savePromptText, setSavePromptText] = useState("")
  const [saveDescription, setSaveDescription] = useState("")
  const [saveName, setSaveName] = useState("")
  const [saveCategory, setSaveCategory] = useState<"image" | "video" | "both">("image")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [saveSuccess, setSaveSuccess] = useState("")

  // Copied feedback
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // Saved templates tracker
  const [savedTemplates, setSavedTemplates] = useState<Set<string>>(new Set())

  const [dragOver, setDragOver] = useState(false)

  const handleFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files).filter((f) =>
      ["image/jpeg", "image/png", "image/webp"].includes(f.type)
    )
    if (fileArray.length === 0) return

    const combined = [...selectedFiles, ...fileArray].slice(0, 10)
    setSelectedFiles(combined)

    // Generate previews
    const newPreviews: string[] = []
    combined.forEach((file) => {
      newPreviews.push(URL.createObjectURL(file))
    })
    // Revoke old preview URLs
    previews.forEach((url) => URL.revokeObjectURL(url))
    setPreviews(newPreviews)
    // Clear old results when new files are added
    setResults([])
    setEditedPrompts({})
  }, [selectedFiles, previews])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length) {
      handleFiles(e.dataTransfer.files)
    }
  }, [handleFiles])

  const clearAll = () => {
    previews.forEach((url) => URL.revokeObjectURL(url))
    setSelectedFiles([])
    setPreviews([])
    setResults([])
    setEditedPrompts({})
    setSavedTemplates(new Set())
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const removeFile = (index: number) => {
    URL.revokeObjectURL(previews[index])
    const newFiles = selectedFiles.filter((_, i) => i !== index)
    const newPreviews = previews.filter((_, i) => i !== index)
    setSelectedFiles(newFiles)
    setPreviews(newPreviews)
    setResults([])
    setEditedPrompts({})
  }

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        const base64 = result.split(",")[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const analyzeImages = async () => {
    if (selectedFiles.length === 0) return

    setAnalyzing(true)
    setResults([])
    setEditedPrompts({})
    setSavedTemplates(new Set())

    const allResults: ImageResult[] = []

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i]
      setCurrentIndex(i)
      setProgress(`Analyzing image ${i + 1} of ${selectedFiles.length}: ${file.name}`)

      try {
        const base64 = await fileToBase64(file)

        const response = await fetch("/api/generate-prompt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            images: [
              {
                base64,
                mimeType: file.type,
                fileName: file.name,
              },
            ],
          }),
        })

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`)
        }

        const data = await response.json()
        const result = data.results[0]

        allResults.push({
          ...result,
          previewUrl: previews[i],
        })
      } catch (error) {
        allResults.push({
          fileName: file.name,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          analysis: null,
          previewUrl: previews[i],
        })
      }

      setResults([...allResults])
    }

    setAnalyzing(false)
    setProgress("")
  }

  const getPromptText = (fileName: string, originalText: string) => {
    return editedPrompts[fileName] ?? originalText
  }

  const updatePrompt = (fileName: string, value: string) => {
    setEditedPrompts((prev) => ({ ...prev, [fileName]: value }))
  }

  const copyToClipboard = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const openSaveModal = (
    promptText: string,
    description: string,
    suggestedName: string
  ) => {
    setSavePromptText(promptText)
    setSaveDescription(description)
    setSaveName(suggestedName)
    setSaveCategory("image")
    setSaveError("")
    setSaveSuccess("")
    setShowSaveModal(true)
  }

  const handleSaveTemplate = async () => {
    if (!saveName.trim()) {
      setSaveError("Template name is required")
      return
    }

    setSaving(true)
    setSaveError("")
    setSaveSuccess("")

    try {
      const response = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: saveName.trim(),
          description: saveDescription.trim() || undefined,
          promptText: savePromptText,
          category: saveCategory,
          variables: [],
        }),
      })

      if (response.status === 409) {
        setSaveError("A template with this name already exists. Choose a different name.")
        setSaving(false)
        return
      }

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || "Failed to save template")
      }

      setSaveSuccess("Template saved successfully!")
      setSavedTemplates((prev) => new Set([...prev, savePromptText]))

      setTimeout(() => {
        setShowSaveModal(false)
      }, 1500)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save template")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-gray-500 hover:text-gray-700"
            >
              &larr; Dashboard
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">
              Generate Prompts from Images
            </h1>
          </div>
          <Link
            href="/templates"
            className="text-purple-600 hover:text-purple-800 font-medium"
          >
            View All Templates &rarr;
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Upload Section */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Upload Jewelry Images
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Upload product images and AI will generate a detailed prompt for each one. Supports JPG, PNG, WebP. Max 10 images.
          </p>

          {/* Drop zone */}
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
              dragOver
                ? "border-blue-500 bg-blue-50"
                : "border-gray-300 hover:border-gray-400"
            }`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="text-gray-400 text-4xl mb-3">+</div>
            <p className="text-gray-600 font-medium">
              Drag and drop images here, or click to browse
            </p>
            <p className="text-gray-400 text-sm mt-1">
              JPG, PNG, or WebP - up to 10 images
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleFiles(e.target.files)
              }}
            />
          </div>

          {/* Thumbnail previews */}
          {selectedFiles.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-700">
                  {selectedFiles.length} image{selectedFiles.length > 1 ? "s" : ""} selected
                </span>
                <button
                  onClick={clearAll}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  Clear All
                </button>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {previews.map((url, idx) => (
                  <div key={idx} className="relative group">
                    <img
                      src={url}
                      alt={selectedFiles[idx]?.name}
                      className="w-full h-24 object-cover rounded-lg border"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        removeFile(idx)
                      }}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      x
                    </button>
                    <p className="text-xs text-gray-500 mt-1 truncate">
                      {selectedFiles[idx]?.name}
                    </p>
                  </div>
                ))}
              </div>

              <button
                onClick={analyzeImages}
                disabled={analyzing}
                className="mt-4 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition font-medium"
              >
                {analyzing ? "Analyzing..." : `Analyze ${selectedFiles.length} Image${selectedFiles.length > 1 ? "s" : ""}`}
              </button>
            </div>
          )}
        </div>

        {/* Progress */}
        {analyzing && (
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center gap-3">
              <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full" />
              <span className="text-gray-700 font-medium">{progress}</span>
            </div>
            <div className="mt-3 w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${((currentIndex + 1) / selectedFiles.length) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">
              Generated Prompts ({results.length} image{results.length > 1 ? "s" : ""})
            </h2>

            {results.map((result, rIdx) => (
              <div
                key={rIdx}
                className="bg-white rounded-xl shadow-sm border overflow-hidden"
              >
                {/* Image header */}
                <div className="p-4 border-b bg-gray-50 flex items-center gap-4">
                  <img
                    src={result.previewUrl}
                    alt={result.fileName}
                    className="w-20 h-20 object-cover rounded-lg border"
                  />
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">
                      {result.fileName}
                    </h3>
                    {result.success ? (
                      <span className="text-sm text-green-600">
                        Analysis complete
                      </span>
                    ) : (
                      <span className="text-sm text-red-600">
                        Failed: {result.error}
                      </span>
                    )}
                  </div>
                  {result.success && result.analysis && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const text = getPromptText(result.fileName, result.analysis!.generationPrompt)
                          copyToClipboard(text, result.fileName)
                        }}
                        className="px-3 py-1.5 text-sm font-medium border rounded-lg hover:bg-gray-50 transition"
                      >
                        {copiedKey === result.fileName ? "Copied!" : "Copy"}
                      </button>
                      <button
                        onClick={() => {
                          const text = getPromptText(result.fileName, result.analysis!.generationPrompt)
                          openSaveModal(
                            text,
                            result.analysis!.productDescription,
                            result.fileName.replace(/\.[^.]+$/, "")
                          )
                        }}
                        disabled={savedTemplates.has(
                          getPromptText(result.fileName, result.analysis!.generationPrompt)
                        )}
                        className={`px-3 py-1.5 text-sm font-medium rounded-lg transition ${
                          savedTemplates.has(getPromptText(result.fileName, result.analysis!.generationPrompt))
                            ? "bg-green-100 text-green-700 cursor-default"
                            : "bg-green-600 text-white hover:bg-green-700"
                        }`}
                      >
                        {savedTemplates.has(getPromptText(result.fileName, result.analysis!.generationPrompt))
                          ? "Saved!"
                          : "Save as Template"}
                      </button>
                    </div>
                  )}
                </div>

                {result.success && result.analysis && (
                  <div className="p-6 space-y-4">
                    {/* Product Description */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">
                        Product Description
                      </h4>
                      <p className="text-gray-700 text-sm">
                        {result.analysis.productDescription}
                      </p>
                    </div>

                    {/* Generation Prompt */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Generation Prompt
                      </h4>
                      <textarea
                        value={getPromptText(result.fileName, result.analysis.generationPrompt)}
                        onChange={(e) => updatePrompt(result.fileName, e.target.value)}
                        rows={8}
                        className="w-full border border-gray-200 rounded-lg p-3 text-sm font-mono resize-y focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Save as Template Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold text-gray-900">
                Save as Prompt Template
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                This prompt will be saved to your template library for reuse.
              </p>
            </div>

            <div className="p-6 space-y-4">
              {/* Template Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Template Name *
                </label>
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="e.g., Diamond Earrings Lifestyle Shot"
                  className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={saveDescription}
                  onChange={(e) => setSaveDescription(e.target.value)}
                  placeholder="Optional description"
                  className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Prompt Text */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Prompt Text
                </label>
                <textarea
                  value={savePromptText}
                  onChange={(e) => setSavePromptText(e.target.value)}
                  rows={6}
                  className="w-full border border-gray-300 rounded-lg p-2.5 font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Category
                </label>
                <div className="flex gap-4">
                  {(["image", "video", "both"] as const).map((cat) => (
                    <label key={cat} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="category"
                        value={cat}
                        checked={saveCategory === cat}
                        onChange={() => setSaveCategory(cat)}
                        className="text-blue-600"
                      />
                      <span className="text-sm text-gray-700 capitalize">
                        {cat}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Error / Success */}
              {saveError && (
                <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">
                  {saveError}
                </div>
              )}
              {saveSuccess && (
                <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm">
                  {saveSuccess}
                </div>
              )}
            </div>

            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={saving || !!saveSuccess}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed transition"
              >
                {saving ? "Saving..." : "Save Template"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
