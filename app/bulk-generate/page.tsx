"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import TemplateSelector from "@/app/components/TemplateSelector"

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

interface ImageType {
  id: string
  name: string
  description: string
  defaultPrompt: string
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

export default function BulkGeneratePage() {
  // Data
  const [products, setProducts] = useState<Product[]>([])
  const [imageTypes, setImageTypes] = useState<ImageType[]>([])
  const [variantSummary, setVariantSummary] = useState<VariantSummary[]>([])

  // Selection state
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())
  const [selectedVariant, setSelectedVariant] = useState<string>("")
  const [selectedImageTypeId, setSelectedImageTypeId] = useState<string>("")
  const [templatePrompt, setTemplatePrompt] = useState<string | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [customPrompt, setCustomPrompt] = useState<string>("")

  // UI state
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [generating, setGenerating] = useState(false)
  const [job, setJob] = useState<Job | null>(null)
  const [skippedCount, setSkippedCount] = useState(0)

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
          }
        }
      } catch {}
    }, 2000)

    return () => clearInterval(interval)
  }, [job])

  const loadData = async () => {
    try {
      const [productsRes, typesRes, variantsRes] = await Promise.all([
        fetch("/api/products"),
        fetch("/api/image-types"),
        fetch("/api/products/variants-summary")
      ])

      if (productsRes.ok) setProducts(await productsRes.json())
      if (typesRes.ok) setImageTypes(await typesRes.json())
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
    if (selectedProducts.size === 0 || !selectedVariant || !selectedImageTypeId) return

    setGenerating(true)
    setJob(null)

    try {
      const finalPrompt = [templatePrompt, customPrompt.trim()].filter(Boolean).join("\n\n")

      const res = await fetch("/api/images/bulk-generate-by-variant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productIds: Array.from(selectedProducts),
          variant: selectedVariant,
          imageTypeId: selectedImageTypeId,
          customPrompt: finalPrompt || undefined,
          templateId: selectedTemplateId || undefined
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

  // Get preview images for selected variant
  const previewImages = selectedVariant
    ? products
        .filter(p => selectedProducts.has(p.id))
        .map(p => {
          const img = p.sourceImages
            .filter(i => i.variant === selectedVariant)
            .reduce((best: SourceImage | null, i) => {
              if (!best) return i
              return (i.width * i.height) > (best.width * best.height) ? i : best
            }, null)
          return img ? { productId: p.id, asin: p.asin, title: p.title, image: img } : null
        })
        .filter(Boolean)
    : []

  const eligibleCount = getEligibleProducts().length
  const missingCount = getMissingProducts().length

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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

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
                  {missingCount} selected product{missingCount !== 1 ? "s" : ""} don't have a {selectedVariant} image and will be skipped.
                </p>
              </div>
            )}

            {/* Preview */}
            {selectedVariant && previewImages.length > 0 && (
              <div className="mt-4">
                <p className="text-sm text-gray-600 mb-2">
                  Preview: {selectedVariant} images from selected products ({previewImages.length})
                </p>
                <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-8 gap-2 max-h-64 overflow-y-auto">
                  {previewImages.map((item: any) => (
                    <div key={item.productId} className="border rounded p-1">
                      <img
                        src={item.image.localFilePath || item.image.amazonImageUrl}
                        alt={item.title}
                        className="w-full h-20 object-contain"
                      />
                      <p className="text-xs text-gray-500 truncate mt-1">{item.asin || item.title.substring(0, 15)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Configure Generation */}
        {selectedProducts.size > 0 && selectedVariant && (
          <>
            {/* Image Type Selection */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Step 3: Select Image Type</h2>
              <p className="text-sm text-gray-500 mb-4">
                Choose what type of image to generate.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {imageTypes.map(type => (
                  <div
                    key={type.id}
                    onClick={() => setSelectedImageTypeId(type.id)}
                    className={`border-2 rounded-lg p-4 cursor-pointer transition ${
                      selectedImageTypeId === type.id
                        ? "border-blue-600 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <h3 className="font-semibold text-gray-900">{type.name}</h3>
                      <input
                        type="radio"
                        checked={selectedImageTypeId === type.id}
                        onChange={() => {}}
                        className="mt-1"
                      />
                    </div>
                    <p className="text-sm text-gray-600">{type.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Template Selector */}
            <TemplateSelector
              category="image"
              onPromptGenerated={(prompt, templateId) => {
                setTemplatePrompt(prompt)
                setSelectedTemplateId(templateId)
              }}
            />

            {/* Custom Prompt */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">
                {templatePrompt ? "Additional Instructions (Optional)" : "Custom Prompt (Optional)"}
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                {templatePrompt
                  ? "Add any additional instructions to combine with the template prompt."
                  : "Enter a prompt that will be applied to all selected products. Use {product_title}, {category}, {asin} as placeholders."
                }
              </p>
              <textarea
                value={customPrompt}
                onChange={e => setCustomPrompt(e.target.value)}
                placeholder={templatePrompt ? "Additional instructions (optional)..." : "Enter custom prompt here..."}
                className="w-full border border-gray-300 rounded-lg p-3 min-h-[100px] focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </>
        )}

        {/* Step 4: Review & Generate */}
        {selectedProducts.size > 0 && selectedVariant && selectedImageTypeId && (
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
                  <p className="text-gray-500">Image Type</p>
                  <p className="font-semibold text-gray-900">
                    {imageTypes.find(t => t.id === selectedImageTypeId)?.name}
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
                <Link
                  href="/dashboard"
                  className="inline-block mt-2 text-sm text-blue-600 hover:underline"
                >
                  View products on dashboard
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
