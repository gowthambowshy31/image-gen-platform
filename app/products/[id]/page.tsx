"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"

interface Product {
  id: string
  title: string
  asin?: string
  category?: string
  status: string
  metadata?: any
  sourceImages: Array<{
    id: string
    amazonImageUrl: string
    localFilePath: string
    variant: string
    width: number
    height: number
  }>
  images: Array<{
    id: string
    imageTypeId: string
    status: string
    version: number
    fileName: string
    filePath: string
    sourceImageId?: string | null
    parentImageId?: string | null
    imageType: {
      id: string
      name: string
    }
    sourceImage?: {
      id: string
      variant: string
      localFilePath: string
    } | null
    parentImage?: {
      id: string
      fileName: string
      version: number
    } | null
  }>
}

export default function ProductDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showRegenerateModal, setShowRegenerateModal] = useState(false)
  const [selectedImageForRegeneration, setSelectedImageForRegeneration] = useState<string | null>(null)
  const [regeneratePrompt, setRegeneratePrompt] = useState("")
  const [regenerating, setRegenerating] = useState(false)

  useEffect(() => {
    loadProduct()
  }, [params.id])

  const loadProduct = async () => {
    try {
      const res = await fetch(`/api/products/${params.id}`)

      if (!res.ok) {
        throw new Error('Failed to load product')
      }

      const data = await res.json()
      setProduct(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const openRegenerateModal = (imageId: string, imageTypeName: string) => {
    setSelectedImageForRegeneration(imageId)
    setRegeneratePrompt(`Regenerate ${imageTypeName}`)
    setShowRegenerateModal(true)
  }

  const handleRegenerate = async () => {
    if (!product || !selectedImageForRegeneration) return

    const generatedImage = product.images.find(img => img.id === selectedImageForRegeneration)
    if (!generatedImage) return

    setRegenerating(true)

    try {
      const response = await fetch('/api/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          imageTypeId: generatedImage.imageTypeId,
          parentImageId: selectedImageForRegeneration,
          customPrompt: regeneratePrompt
        })
      })

      if (response.ok) {
        setShowRegenerateModal(false)
        setRegeneratePrompt("")
        setSelectedImageForRegeneration(null)
        // Reload product to show new image
        await loadProduct()
        alert('Image regenerated successfully!')
      } else {
        const errorData = await response.json()
        alert(`Failed to regenerate: ${errorData.error || 'Unknown error'}`)
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setRegenerating(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading product...</p>
        </div>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Error</h2>
          <p className="text-gray-600 mb-4">{error || 'Product not found'}</p>
          <Link
            href="/dashboard"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  const inventory = (product.metadata as any)?.inventory?.quantity || 0

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="text-gray-600 hover:text-gray-900"
              >
                ← Back
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Product Details</h1>
            </div>
            <Link
              href={`/products/${product.id}/generate`}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
            >
              Generate Images
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Product Info */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">{product.title}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-500">ASIN</p>
              <p className="font-semibold">{product.asin || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Category</p>
              <p className="font-semibold">{product.category || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Status</p>
              <p className="font-semibold">{product.status.replace('_', ' ')}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Inventory</p>
              <p className="font-semibold text-blue-600">{inventory} units</p>
            </div>
          </div>
        </div>

        {/* Source Images */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Source Images from Amazon ({product.sourceImages?.length || 0})
          </h2>
          {product.sourceImages && product.sourceImages.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {product.sourceImages.map((image) => (
                <div key={image.id} className="border rounded-lg p-2 hover:shadow-lg transition">
                  <div className="relative aspect-square bg-gray-100 rounded">
                    <img
                      src={image.amazonImageUrl}
                      alt={`${product.title} - ${image.variant}`}
                      className="object-contain w-full h-full rounded"
                    />
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    <p className="font-medium">{image.variant}</p>
                    <p>{image.width} × {image.height}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No source images available</p>
          )}
        </div>

        {/* Generated Images */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Generated Images ({product.images?.length || 0})
          </h2>
          {product.images && product.images.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {product.images.map((image) => (
                <div key={image.id} className="border rounded-lg p-2 hover:shadow-lg transition group">
                  <div className="relative aspect-square bg-gray-100 rounded">
                    <img
                      src={`/uploads/${image.fileName}`}
                      alt={`${product.title} - ${image.imageType.name}`}
                      className="object-contain w-full h-full rounded"
                    />
                    <button
                      onClick={() => openRegenerateModal(image.id, image.imageType.name)}
                      className="absolute top-2 right-2 bg-blue-600 text-white px-3 py-1 rounded text-xs font-semibold opacity-0 group-hover:opacity-100 transition hover:bg-blue-700"
                    >
                      Regenerate
                    </button>
                  </div>
                  <div className="mt-2 text-xs">
                    <p className="font-medium text-gray-700 mb-1">{image.imageType.name}</p>
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      image.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                      image.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                      image.status === 'COMPLETED' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {image.status}
                    </span>
                    <p className="text-gray-500 mt-1">Version {image.version}</p>

                    {/* Generation History Indicators */}
                    {image.sourceImage && (
                      <div className="mt-2 flex items-center gap-1 text-purple-600">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
                          <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/>
                        </svg>
                        <span className="text-[10px]">From {image.sourceImage.variant}</span>
                      </div>
                    )}
                    {image.parentImage && (
                      <div className="mt-1 flex items-center gap-1 text-orange-600">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd"/>
                        </svg>
                        <span className="text-[10px]">Regenerated v{image.parentImage.version}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">No generated images yet</p>
              <Link
                href={`/products/${product.id}/generate`}
                className="inline-block px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
              >
                Generate Images
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Regenerate Modal */}
      {showRegenerateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Regenerate Image</h2>

            <div className="mb-6">
              <p className="text-gray-600 mb-4">
                This will create a new version using the current image as a source.
                Add instructions like "make the diamond smaller", "increase brightness", "change background color", etc.
              </p>

              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Regeneration Prompt
              </label>
              <textarea
                value={regeneratePrompt}
                onChange={(e) => setRegeneratePrompt(e.target.value)}
                placeholder="e.g., make the diamond smaller, increase product size, brighter lighting..."
                className="w-full border border-gray-300 rounded-lg p-3 min-h-[120px] focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={regenerating}
              />
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-yellow-900 mb-2">How it works:</h3>
              <ul className="list-disc list-inside text-sm text-yellow-800 space-y-1">
                <li>The current image will be used as the source/base</li>
                <li>AI will apply your instructions to modify the image</li>
                <li>A new version will be created (version number will increment)</li>
                <li>The original image will remain unchanged</li>
              </ul>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowRegenerateModal(false)
                  setRegeneratePrompt("")
                  setSelectedImageForRegeneration(null)
                }}
                disabled={regenerating}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRegenerate}
                disabled={regenerating || !regeneratePrompt.trim()}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {regenerating ? (
                  <span className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Regenerating...
                  </span>
                ) : (
                  'Regenerate Image'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
