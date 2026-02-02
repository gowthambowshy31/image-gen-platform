"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import TemplateSelector, { TemplateSelection } from "@/app/components/TemplateSelector"

interface SourceImage {
  id: string
  amazonImageUrl: string
  localFilePath: string | null
  variant: string
  width: number
  height: number
}

interface Product {
  id: string
  title: string
  asin?: string
  category?: string
  status: string
  sourceImages: SourceImage[]
  metadata?: any
  _count: {
    images: number
    sourceImages: number
  }
}

interface VariantSummary {
  variant: string
  count: number
}

interface Job {
  id: string
  status: string
  totalImages: number
  completedImages: number
  failedImages: number
  errorLog: string | null
  startedAt: string | null
  completedAt: string | null
}

interface HistoryJob {
  id: string
  productIds: string[]
  imageTypeIds: string[]
  templateIds: string[]
  variant: string | null
  promptUsed: string | null
  status: string
  totalImages: number
  completedImages: number
  failedImages: number
  errorLog: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  productNames: string[]
  imageTypeNames: string[]
  templateNames: string[]
}

interface JobImage {
  id: string
  filePath: string
  fileName: string
  status: string
  version: number
  product: { id: string; title: string; asin: string | null }
  imageType?: { id: string; name: string } | null
  template?: { id: string; name: string } | null
  templateName?: string | null
  createdAt: string
}

// Get the display URL for a generated image (handles S3 URLs, absolute server paths, and local paths)
const getImageUrl = (image: JobImage) => {
  if (image.filePath?.startsWith('http')) {
    // S3 URL - extract key and use proxy to avoid CORS/auth issues
    try {
      const url = new URL(image.filePath)
      const key = url.pathname.substring(1) // Remove leading slash
      return `/api/s3-proxy?key=${encodeURIComponent(key)}`
    } catch {
      return image.filePath
    }
  }

  // For absolute server paths (e.g., /home/ubuntu/...) or relative paths,
  // use the fileName to load via the uploads API
  return `/api/uploads/${image.fileName}`
}

export default function BulkGeneratePage() {
  // Tab state
  const [activeTab, setActiveTab] = useState<"generate" | "history">("generate")

  // Data
  const [products, setProducts] = useState<Product[]>([])
  const [variantSummary, setVariantSummary] = useState<VariantSummary[]>([])

  // Selection state
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())
  const [selectedVariant, setSelectedVariant] = useState<string>("")
  const [templateSelection, setTemplateSelection] = useState<TemplateSelection | null>(null)
  const [customPrompt, setCustomPrompt] = useState<string>("")

  // UI state
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [generating, setGenerating] = useState(false)
  const [job, setJob] = useState<Job | null>(null)
  const [skippedCount, setSkippedCount] = useState(0)

  // History state
  const [historyJobs, setHistoryJobs] = useState<HistoryJob[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)
  const [historyTotalPages, setHistoryTotalPages] = useState(1)
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null)
  const [jobImages, setJobImages] = useState<Record<string, JobImage[]>>({})
  const [jobImagesLoading, setJobImagesLoading] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  // Poll job status
  useEffect(() => {
    if (!job || job.status === "COMPLETED" || job.status === "FAILED" || job.status === "CANCELLED") return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${job.id}`)
        if (res.ok) {
          const updatedJob = await res.json()
          setJob(updatedJob)
          if (updatedJob.status === "COMPLETED" || updatedJob.status === "FAILED") {
            setGenerating(false)
            // Auto-switch to history tab and refresh
            setActiveTab("history")
            loadHistory(1)
          }
        }
      } catch {}
    }, 2000)

    return () => clearInterval(interval)
  }, [job])

  // Load history when tab changes
  useEffect(() => {
    if (activeTab === "history" && historyJobs.length === 0) {
      loadHistory(1)
    }
  }, [activeTab])

  const loadData = async () => {
    try {
      const [productsRes, variantsRes] = await Promise.all([
        fetch("/api/products"),
        fetch("/api/products/variants-summary")
      ])

      if (productsRes.ok) setProducts(await productsRes.json())
      if (variantsRes.ok) {
        const data = await variantsRes.json()
        setVariantSummary(data.variants)
      }
    } catch (error) {
      console.error("Error loading data:", error)
    } finally {
      setLoading(false)
    }
  }

  const loadHistory = async (page: number) => {
    setHistoryLoading(true)
    try {
      const res = await fetch(`/api/jobs?page=${page}&limit=10`)
      if (res.ok) {
        const data = await res.json()
        setHistoryJobs(data.jobs)
        setHistoryPage(data.page)
        setHistoryTotalPages(data.totalPages)
      }
    } catch (error) {
      console.error("Error loading job history:", error)
    } finally {
      setHistoryLoading(false)
    }
  }

  const loadJobImages = async (jobId: string) => {
    if (jobImages[jobId]) {
      // Already loaded, just toggle
      setExpandedJobId(expandedJobId === jobId ? null : jobId)
      return
    }

    setJobImagesLoading(jobId)
    setExpandedJobId(jobId)
    try {
      const res = await fetch(`/api/jobs/${jobId}/images`)
      if (res.ok) {
        const data = await res.json()
        setJobImages(prev => ({ ...prev, [jobId]: data.images }))
      }
    } catch (error) {
      console.error("Error loading job images:", error)
    } finally {
      setJobImagesLoading(null)
    }
  }

  const toggleProduct = (productId: string) => {
    const next = new Set(selectedProducts)
    if (next.has(productId)) next.delete(productId)
    else next.add(productId)
    setSelectedProducts(next)
  }

  const toggleSelectAll = () => {
    if (selectedProducts.size === filteredProducts.length && filteredProducts.length > 0) {
      setSelectedProducts(new Set())
    } else {
      setSelectedProducts(new Set(filteredProducts.map(p => p.id)))
    }
  }

  // Products matching current variant that are selected
  const getEligibleProducts = useCallback(() => {
    if (!selectedVariant) return []
    return products.filter(
      p => selectedProducts.has(p.id) && p.sourceImages.some(img => img.variant === selectedVariant)
    )
  }, [products, selectedProducts, selectedVariant])

  const getMissingProducts = useCallback(() => {
    if (!selectedVariant) return []
    return products.filter(
      p => selectedProducts.has(p.id) && !p.sourceImages.some(img => img.variant === selectedVariant)
    )
  }, [products, selectedProducts, selectedVariant])

  // Get variant counts for selected products only
  const getSelectedVariantCounts = useCallback(() => {
    const counts: Record<string, number> = {}
    products
      .filter(p => selectedProducts.has(p.id))
      .forEach(p => {
        const variants = new Set(p.sourceImages.map(img => img.variant))
        variants.forEach(v => {
          counts[v] = (counts[v] || 0) + 1
        })
      })
    return Object.entries(counts)
      .map(([variant, count]) => ({ variant, count }))
      .sort((a, b) => b.count - a.count)
  }, [products, selectedProducts])

  const handleGenerate = async () => {
    if (selectedProducts.size === 0 || !selectedVariant || !templateSelection) return

    setGenerating(true)
    setJob(null)

    try {
      const renderedPrompt = customPrompt.trim()
        ? templateSelection.renderedPrompt + "\n\n" + customPrompt.trim()
        : templateSelection.renderedPrompt

      const res = await fetch("/api/images/bulk-generate-by-variant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productIds: Array.from(selectedProducts),
          variant: selectedVariant,
          templateId: templateSelection.templateId,
          renderedPrompt
        })
      })

      if (res.ok) {
        const data = await res.json()
        setSkippedCount(data.skippedProducts || 0)
        // Start polling
        const jobRes = await fetch(`/api/jobs/${data.jobId}`)
        if (jobRes.ok) {
          setJob(await jobRes.json())
        }
      } else {
        const err = await res.json()
        alert("Failed to start bulk generation: " + (err.error || "Unknown error"))
        setGenerating(false)
      }
    } catch (error) {
      console.error("Error starting bulk generation:", error)
      alert("Failed to start bulk generation")
      setGenerating(false)
    }
  }

  // Filter products by search
  const filteredProducts = products.filter(p =>
    p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.asin && p.asin.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  // Get preview images for selected variant — show ALL products with the variant, not just selected
  const previewImages = selectedVariant
    ? products
        .filter(p => p.sourceImages.some(i => i.variant === selectedVariant))
        .map(p => {
          const img = p.sourceImages
            .filter(i => i.variant === selectedVariant)
            .reduce((best: SourceImage | null, i) => {
              if (!best) return i
              return (i.width * i.height) > (best.width * best.height) ? i : best
            }, null)
          return img ? { productId: p.id, asin: p.asin, title: p.title, image: img, selected: selectedProducts.has(p.id) } : null
        })
        .filter(Boolean) as { productId: string; asin?: string; title: string; image: SourceImage; selected: boolean }[]
    : []

  const selectedPreviewCount = previewImages.filter(i => i.selected).length

  const eligibleCount = getEligibleProducts().length
  const missingCount = getMissingProducts().length

  // Helper: format date for history
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
  }

  // Helper: format duration
  const formatDuration = (startStr: string | null, endStr: string | null) => {
    if (!startStr || !endStr) return "-"
    const ms = new Date(endStr).getTime() - new Date(startStr).getTime()
    if (ms < 60000) return `${Math.round(ms / 1000)}s`
    const mins = Math.floor(ms / 60000)
    const secs = Math.round((ms % 60000) / 1000)
    return `${mins}m ${secs}s`
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED": return "bg-green-100 text-green-800"
      case "FAILED": return "bg-red-100 text-red-800"
      case "PROCESSING": return "bg-blue-100 text-blue-800"
      case "QUEUED": return "bg-gray-100 text-gray-800"
      case "CANCELLED": return "bg-yellow-100 text-yellow-800"
      default: return "bg-gray-100 text-gray-800"
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">
                &larr; Back to Dashboard
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Bulk Generate Images</h1>
            </div>
          </div>
        </div>
      </header>

      {/* Tab Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <div className="flex gap-1 border-b border-gray-200">
          <button
            onClick={() => setActiveTab("generate")}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition ${
              activeTab === "generate"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            + New Generation
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition ${
              activeTab === "history"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Job History
          </button>
        </div>
      </div>

      {/* ==================== GENERATE TAB ==================== */}
      {activeTab === "generate" && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

          {/* Step 1: Select Products */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Step 1: Select Products</h2>
            <p className="text-sm text-gray-500 mb-4">
              Choose the products you want to generate images for. {selectedProducts.size > 0 && `${selectedProducts.size} selected`}
            </p>

            {/* Search */}
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search by title or ASIN..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Product table */}
            <div className="overflow-x-auto max-h-96 overflow-y-auto border rounded-lg">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      <input
                        type="checkbox"
                        checked={selectedProducts.size === filteredProducts.length && filteredProducts.length > 0}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ASIN</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source Images</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Variants</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredProducts.map(product => {
                    const uniqueVariants = Array.from(new Set(product.sourceImages.map(i => i.variant)))
                    return (
                      <tr
                        key={product.id}
                        className={`hover:bg-gray-50 cursor-pointer ${selectedProducts.has(product.id) ? "bg-blue-50" : ""}`}
                        onClick={() => toggleProduct(product.id)}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedProducts.has(product.id)}
                            onChange={() => {}}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">{product.title}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{product.asin || "-"}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{product._count.sourceImages}</td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex gap-1 flex-wrap">
                            {uniqueVariants.map(v => (
                              <span key={v} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                                {v}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex gap-3">
              <button
                onClick={() => setSelectedProducts(new Set(filteredProducts.map(p => p.id)))}
                className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded"
              >
                Select All ({filteredProducts.length})
              </button>
              <button
                onClick={() => setSelectedProducts(new Set())}
                className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-50 rounded"
              >
                Deselect All
              </button>
            </div>
          </div>

          {/* Step 2: Select Variant */}
          {selectedProducts.size > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Step 2: Select Image Variant</h2>
              <p className="text-sm text-gray-500 mb-4">
                Choose which image position to use from each product.
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {getSelectedVariantCounts().map(({ variant, count }) => (
                  <button
                    key={variant}
                    onClick={() => setSelectedVariant(variant)}
                    className={`border-2 rounded-lg p-3 text-center transition ${
                      selectedVariant === variant
                        ? "border-blue-600 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <p className="font-semibold text-gray-900">{variant}</p>
                    <p className="text-sm text-gray-500">{count}/{selectedProducts.size} products</p>
                  </button>
                ))}
              </div>

              {selectedVariant && missingCount > 0 && (
                <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-sm text-yellow-700">
                    {missingCount} selected product{missingCount !== 1 ? "s" : ""} don&apos;t have a {selectedVariant} image and will be skipped.
                  </p>
                </div>
              )}

              {/* Interactive Preview Grid */}
              {selectedVariant && previewImages.length > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-sm text-gray-600">
                      Preview: {selectedVariant} images ({selectedPreviewCount} selected of {previewImages.length})
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const variantProductIds = previewImages.map(i => i.productId)
                          const next = new Set(selectedProducts)
                          variantProductIds.forEach(id => next.add(id))
                          setSelectedProducts(next)
                        }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Select All
                      </button>
                      <button
                        onClick={() => {
                          const variantProductIds = new Set(previewImages.map(i => i.productId))
                          const next = new Set(selectedProducts)
                          variantProductIds.forEach(id => next.delete(id))
                          setSelectedProducts(next)
                        }}
                        className="text-xs text-gray-500 hover:underline"
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-8 gap-2 max-h-80 overflow-y-auto">
                    {previewImages.map((item) => (
                      <div
                        key={item.productId}
                        onClick={() => toggleProduct(item.productId)}
                        className={`relative border-2 rounded p-1 cursor-pointer transition-all ${
                          item.selected
                            ? "border-green-500 bg-green-50"
                            : "border-gray-200 bg-gray-50 hover:border-gray-300"
                        }`}
                      >
                        <img
                          src={item.image.localFilePath?.startsWith('http') ? item.image.localFilePath : item.image.localFilePath ? `/api${item.image.localFilePath}` : item.image.amazonImageUrl}
                          alt={item.title}
                          className={`w-full h-24 object-contain transition-all ${
                            item.selected ? "" : "opacity-40 grayscale"
                          }`}
                        />
                        <p className={`text-xs truncate mt-1 ${
                          item.selected ? "text-gray-700" : "text-gray-400"
                        }`}>
                          {item.asin || item.title.substring(0, 15)}
                        </p>
                        {item.selected && (
                          <div className="absolute top-0.5 right-0.5 bg-green-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                            &#10003;
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Select Template */}
          {selectedProducts.size > 0 && selectedVariant && (
            <>
              <TemplateSelector
                category="image"
                mode="single"
                onSelectionChange={(selections) => {
                  setTemplateSelection(selections.length > 0 ? selections[0] : null)
                }}
              />

              {/* Custom Prompt */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-1">
                  {templateSelection ? "Additional Instructions (Optional)" : "Custom Prompt (Optional)"}
                </h2>
                <p className="text-sm text-gray-500 mb-4">
                  {templateSelection
                    ? "Add any additional instructions to combine with the template prompt."
                    : "Select a template above first, then optionally add extra instructions."
                  }
                </p>
                <textarea
                  value={customPrompt}
                  onChange={e => setCustomPrompt(e.target.value)}
                  placeholder={templateSelection ? "Additional instructions (optional)..." : "Select a template first..."}
                  className="w-full border border-gray-300 rounded-lg p-3 min-h-[100px] focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </>
          )}

          {/* Step 4: Review & Generate */}
          {selectedProducts.size > 0 && selectedVariant && templateSelection && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Review & Generate</h2>

              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Products Selected</p>
                    <p className="font-semibold text-gray-900">{selectedProducts.size}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Variant</p>
                    <p className="font-semibold text-gray-900">{selectedVariant}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Template</p>
                    <p className="font-semibold text-gray-900">
                      {templateSelection.templateName}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">Images to Generate</p>
                    <p className="font-semibold text-green-600">{eligibleCount}</p>
                    {missingCount > 0 && (
                      <p className="text-xs text-yellow-600">{missingCount} will be skipped</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-center">
                <button
                  onClick={handleGenerate}
                  disabled={generating || eligibleCount === 0}
                  className={`px-8 py-3 rounded-lg font-semibold text-white transition ${
                    generating || eligibleCount === 0
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-green-600 hover:bg-green-700"
                  }`}
                >
                  {generating ? (
                    <span className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Generating...
                    </span>
                  ) : (
                    `Generate ${eligibleCount} Image${eligibleCount !== 1 ? "s" : ""}`
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Job Progress */}
          {job && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Generation Progress</h2>

              {/* Progress bar */}
              <div className="mb-4">
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>
                    {job.completedImages + job.failedImages} / {job.totalImages} processed
                  </span>
                  <span>
                    {job.status === "COMPLETED" || job.status === "FAILED"
                      ? job.status
                      : Math.round(((job.completedImages + job.failedImages) / job.totalImages) * 100) + "%"
                    }
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all duration-500 ${
                      job.status === "FAILED" ? "bg-red-500" :
                      job.status === "COMPLETED" ? "bg-green-500" : "bg-blue-500"
                    }`}
                    style={{ width: `${Math.round(((job.completedImages + job.failedImages) / job.totalImages) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">{job.completedImages}</p>
                  <p className="text-sm text-green-700">Completed</p>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <p className="text-2xl font-bold text-red-600">{job.failedImages}</p>
                  <p className="text-sm text-red-700">Failed</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold text-gray-600">
                    {job.totalImages - job.completedImages - job.failedImages}
                  </p>
                  <p className="text-sm text-gray-700">Remaining</p>
                </div>
              </div>

              {skippedCount > 0 && (
                <p className="text-sm text-yellow-600 mb-3">
                  {skippedCount} product{skippedCount !== 1 ? "s" : ""} skipped (missing selected variant)
                </p>
              )}

              {/* Error log */}
              {job.errorLog && (
                <div className="mt-4">
                  <p className="text-sm font-medium text-red-700 mb-2">Errors:</p>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                    {job.errorLog.split("\n").map((err, i) => (
                      <p key={i} className="text-sm text-red-600">{err}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Done message */}
              {(job.status === "COMPLETED" || job.status === "FAILED") && (
                <div className={`mt-4 p-4 rounded-lg ${job.status === "COMPLETED" ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                  <p className={`font-semibold ${job.status === "COMPLETED" ? "text-green-700" : "text-red-700"}`}>
                    {job.status === "COMPLETED"
                      ? `Bulk generation complete! ${job.completedImages} image${job.completedImages !== 1 ? "s" : ""} generated successfully.`
                      : "Bulk generation finished with errors."
                    }
                  </p>
                  <p className="mt-2 text-sm text-gray-600">
                    Switching to Job History tab to view results...
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ==================== HISTORY TAB ==================== */}
      {activeTab === "history" && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

          {historyLoading && historyJobs.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading job history...</p>
            </div>
          ) : historyJobs.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No generation jobs yet</h3>
              <p className="mt-1 text-sm text-gray-500">
                Start a new bulk generation to see job history here.
              </p>
              <button
                onClick={() => setActiveTab("generate")}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
              >
                Start New Generation
              </button>
            </div>
          ) : (
            <>
              {/* Job list */}
              <div className="space-y-4">
                {historyJobs.map(hJob => (
                  <div key={hJob.id} className="bg-white rounded-lg shadow">
                    {/* Job summary row */}
                    <div className="p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${getStatusBadge(hJob.status)}`}>
                              {hJob.status}
                            </span>
                            <span className="text-sm text-gray-500">{formatDate(hJob.createdAt)}</span>
                            {hJob.startedAt && hJob.completedAt && (
                              <span className="text-xs text-gray-400">
                                Duration: {formatDuration(hJob.startedAt, hJob.completedAt)}
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                            <div>
                              <p className="text-gray-500">Variant</p>
                              <p className="font-medium text-gray-900">{hJob.variant || "N/A"}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Template</p>
                              <p className="font-medium text-gray-900">
                                {(hJob.templateNames && hJob.templateNames[0]) || hJob.imageTypeNames[0] || "N/A"}
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-500">Products</p>
                              <p className="font-medium text-gray-900">{hJob.productIds.length}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Completed</p>
                              <p className="font-medium text-green-600">{hJob.completedImages}/{hJob.totalImages}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Failed</p>
                              <p className={`font-medium ${hJob.failedImages > 0 ? "text-red-600" : "text-gray-400"}`}>
                                {hJob.failedImages}
                              </p>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => loadJobImages(hJob.id)}
                          className={`ml-4 px-4 py-2 text-sm rounded-lg transition ${
                            expandedJobId === hJob.id
                              ? "bg-blue-100 text-blue-700"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          }`}
                        >
                          {expandedJobId === hJob.id ? "Hide Images" : "View Images"}
                        </button>
                      </div>

                      {/* Prompt used */}
                      {hJob.promptUsed && (
                        <details className="mt-3">
                          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                            View prompt used
                          </summary>
                          <pre className="mt-2 text-xs text-gray-600 bg-gray-50 rounded p-3 whitespace-pre-wrap max-h-32 overflow-y-auto">
                            {hJob.promptUsed}
                          </pre>
                        </details>
                      )}

                      {/* Error log */}
                      {hJob.errorLog && (
                        <details className="mt-2">
                          <summary className="text-xs text-red-500 cursor-pointer hover:text-red-700">
                            View errors ({hJob.failedImages} failed)
                          </summary>
                          <div className="mt-2 bg-red-50 border border-red-200 rounded p-3 max-h-32 overflow-y-auto">
                            {hJob.errorLog.split("\n").map((err, i) => (
                              <p key={i} className="text-xs text-red-600">{err}</p>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>

                    {/* Expanded: Generated images */}
                    {expandedJobId === hJob.id && (
                      <div className="border-t border-gray-200 p-5 bg-gray-50">
                        {jobImagesLoading === hJob.id ? (
                          <div className="text-center py-6">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="mt-2 text-sm text-gray-500">Loading images...</p>
                          </div>
                        ) : (jobImages[hJob.id] || []).length === 0 ? (
                          <p className="text-sm text-gray-500 text-center py-4">No generated images found for this job.</p>
                        ) : (
                          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                            {(jobImages[hJob.id] || []).map(img => (
                              <Link
                                key={img.id}
                                href={`/products/${img.product.id}`}
                                className="block border rounded-lg bg-white overflow-hidden hover:shadow-md transition group"
                              >
                                <div className="relative">
                                  <img
                                    src={getImageUrl(img)}
                                    alt={img.fileName}
                                    className="w-full h-32 object-contain bg-white"
                                  />
                                  <span className={`absolute top-1 right-1 px-1.5 py-0.5 text-xs rounded ${
                                    img.status === "COMPLETED" ? "bg-green-100 text-green-700" :
                                    img.status === "REJECTED" ? "bg-red-100 text-red-700" :
                                    "bg-gray-100 text-gray-700"
                                  }`}>
                                    {img.status === "COMPLETED" ? "OK" : img.status}
                                  </span>
                                </div>
                                <div className="p-2">
                                  <p className="text-xs font-medium text-gray-900 truncate group-hover:text-blue-600">
                                    {img.product.asin || img.product.title.substring(0, 20)}
                                  </p>
                                  <p className="text-xs text-gray-400 truncate">
                                    {img.templateName || img.template?.name || img.imageType?.name || "Generated"}
                                  </p>
                                </div>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {historyTotalPages > 1 && (
                <div className="flex justify-center gap-2">
                  <button
                    onClick={() => loadHistory(historyPage - 1)}
                    disabled={historyPage <= 1}
                    className="px-4 py-2 text-sm border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Previous
                  </button>
                  <span className="px-4 py-2 text-sm text-gray-600">
                    Page {historyPage} of {historyTotalPages}
                  </span>
                  <button
                    onClick={() => loadHistory(historyPage + 1)}
                    disabled={historyPage >= historyTotalPages}
                    className="px-4 py-2 text-sm border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
