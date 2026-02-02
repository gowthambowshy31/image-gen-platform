"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"

interface SourceImage {
  id: string
  amazonImageUrl: string
  localFilePath: string
  variant: string
  width: number
  height: number
}

interface GeneratedImage {
  id: string
  imageTypeId?: string | null
  templateId?: string | null
  templateName?: string | null
  status: string
  version: number
  fileName: string
  filePath: string
  sourceImageId?: string | null
  parentImageId?: string | null
  imageType?: {
    id: string
    name: string
  } | null
  template?: {
    id: string
    name: string
  } | null
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
}

interface Product {
  id: string
  title: string
  asin?: string
  category?: string
  status: string
  metadata?: any
  sourceImages: SourceImage[]
  images: GeneratedImage[]
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
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [imageView, setImageView] = useState<'grid' | 'table'>('grid')
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null)

  // Download a single image using the proxy API to avoid CORS issues
  const downloadImage = async (imageUrl: string, fileName: string) => {
    try {
      // Use the proxy endpoint to download external images
      const proxyUrl = `/api/download/image?url=${encodeURIComponent(imageUrl)}&filename=${encodeURIComponent(fileName)}`
      const link = document.createElement('a')
      link.href = proxyUrl
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error('Download failed:', error)
      alert('Failed to download image')
    }
  }

  // Download all generated images as ZIP
  const downloadAllGeneratedImages = async () => {
    if (!product || product.images.length === 0) return

    setDownloadingAll(true)
    try {
      const response = await fetch('/api/download/zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          imageType: 'generated'
        })
      })

      if (!response.ok) {
        throw new Error('Failed to generate ZIP file')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${product.asin || product.id}-generated-images.zip`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Download all failed:', error)
      alert('Failed to download images')
    } finally {
      setDownloadingAll(false)
    }
  }

  // Download all source images as ZIP
  const downloadAllSourceImages = async () => {
    if (!product || product.sourceImages.length === 0) return

    setDownloadingAll(true)
    try {
      const response = await fetch('/api/download/zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          imageType: 'source'
        })
      })

      if (!response.ok) {
        throw new Error('Failed to generate ZIP file')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${product.asin || product.id}-source-images.zip`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Download all failed:', error)
      alert('Failed to download images')
    } finally {
      setDownloadingAll(false)
    }
  }

  // Get the display URL for a generated image
  const getImageUrl = (image: GeneratedImage) => {
    if (image.filePath?.startsWith('http')) {
      // Extract S3 key from the URL and use proxy to avoid CORS/auth issues
      try {
        const url = new URL(image.filePath)
        const key = url.pathname.substring(1) // Remove leading slash
        return `/api/s3-proxy?key=${encodeURIComponent(key)}`
      } catch {
        return image.filePath
      }
    }
    // Use the dynamic API route to serve uploaded files (Next.js production
    // mode does not serve files added to /public after build time)
    return `/api/uploads/${image.fileName}`
  }

  // Delete a generated image
  const handleDeleteImage = async (imageId: string) => {
    if (!confirm('Are you sure you want to delete this image? This action cannot be undone.')) return

    setDeletingImageId(imageId)
    try {
      const response = await fetch(`/api/images/${imageId}`, { method: 'DELETE' })
      if (response.ok) {
        await loadProduct()
      } else {
        const errorData = await response.json()
        alert(`Failed to delete: ${errorData.error || 'Unknown error'}`)
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setDeletingImageId(null)
    }
  }

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

  const getImageDisplayName = (image: GeneratedImage) => {
    return image.templateName || image.template?.name || image.imageType?.name || 'Generated Image'
  }

  const openRegenerateModal = (imageId: string, displayName: string) => {
    setSelectedImageForRegeneration(imageId)
    setRegeneratePrompt(`Regenerate ${displayName}`)
    setShowRegenerateModal(true)
  }

  const handleRegenerate = async () => {
    if (!product || !selectedImageForRegeneration) return

    const generatedImage = product.images.find(img => img.id === selectedImageForRegeneration)
    if (!generatedImage) return

    setRegenerating(true)

    try {
      const requestBody: any = {
        productId: product.id,
        parentImageId: selectedImageForRegeneration,
        customPrompt: regeneratePrompt
      }

      // Use templateId if available, otherwise fall back to imageTypeId
      if (generatedImage.templateId) {
        requestBody.templateId = generatedImage.templateId
      } else if (generatedImage.imageTypeId) {
        requestBody.imageTypeId = generatedImage.imageTypeId
      }

      const response = await fetch('/api/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
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

  // Filter source images: only keep the largest image per variant
  const filteredSourceImages = (() => {
    if (!product.sourceImages) return []
    const variantMap = new Map<string, SourceImage>()
    for (const img of product.sourceImages) {
      const variant = img.variant || "UNKNOWN"
      const existing = variantMap.get(variant)
      if (!existing || (img.width * img.height) > (existing.width * existing.height)) {
        variantMap.set(variant, img)
      }
    }
    return Array.from(variantMap.values())
  })()

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
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Source Images from Amazon ({filteredSourceImages.length})
            </h2>
            {filteredSourceImages.length > 0 && (
              <button
                onClick={downloadAllSourceImages}
                disabled={downloadingAll}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                {downloadingAll ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Preparing...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download All
                  </>
                )}
              </button>
            )}
          </div>
          {filteredSourceImages.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredSourceImages.map((image) => (
                <div key={image.id} className="border rounded-lg p-2 hover:shadow-lg transition group">
                  <div className="relative aspect-square bg-gray-100 rounded">
                    <img
                      src={image.amazonImageUrl}
                      alt={`${product.title} - ${image.variant}`}
                      className="object-contain w-full h-full rounded"
                    />
                    <button
                      onClick={() => downloadImage(image.amazonImageUrl, `${product.asin || product.id}-${image.variant}.jpg`)}
                      className="absolute top-2 right-2 bg-gray-800 bg-opacity-75 text-white p-1.5 rounded opacity-0 group-hover:opacity-100 transition hover:bg-opacity-100"
                      title="Download image"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </button>
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
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Generated Images ({product.images?.length || 0})
            </h2>
            {product.images && product.images.length > 0 && (
              <div className="flex items-center gap-3">
                {/* View Toggle */}
                <div className="flex items-center border rounded-lg overflow-hidden">
                  <button
                    onClick={() => setImageView('grid')}
                    className={`px-3 py-1.5 text-sm flex items-center gap-1 ${
                      imageView === 'grid' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                    title="Grid view"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setImageView('table')}
                    className={`px-3 py-1.5 text-sm flex items-center gap-1 ${
                      imageView === 'table' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                    title="Table view"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                  </button>
                </div>
                {/* Download All Button */}
                <button
                  onClick={downloadAllGeneratedImages}
                  disabled={downloadingAll}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {downloadingAll ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Preparing...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download All
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
          {product.images && product.images.length > 0 ? (
            imageView === 'grid' ? (
              /* Grid View */
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {product.images.map((image) => (
                  <div key={image.id} className="border rounded-lg p-2 hover:shadow-lg transition group">
                    <div className="relative aspect-square bg-gray-100 rounded">
                      <img
                        src={getImageUrl(image)}
                        alt={`${product.title} - ${getImageDisplayName(image)}`}
                        className="object-contain w-full h-full rounded"
                      />
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button
                          onClick={() => handleDeleteImage(image.id)}
                          disabled={deletingImageId === image.id}
                          className="bg-red-600 bg-opacity-90 text-white p-1.5 rounded hover:bg-opacity-100 disabled:opacity-50"
                          title="Delete image"
                        >
                          {deletingImageId === image.id ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={() => downloadImage(getImageUrl(image), image.fileName)}
                          className="bg-gray-800 bg-opacity-75 text-white p-1.5 rounded hover:bg-opacity-100"
                          title="Download image"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        </button>
                        <button
                          onClick={() => openRegenerateModal(image.id, getImageDisplayName(image))}
                          className="bg-blue-600 text-white px-2 py-1 rounded text-xs font-semibold hover:bg-blue-700"
                        >
                          Regenerate
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 text-xs">
                      <p className="font-medium text-gray-700 mb-1">{getImageDisplayName(image)}</p>
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
              /* Table View */
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Image</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Filename</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Version</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {product.images.map((image) => (
                      <tr key={image.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="w-16 h-16 bg-gray-100 rounded overflow-hidden">
                            <img
                              src={getImageUrl(image)}
                              alt={getImageDisplayName(image)}
                              className="w-full h-full object-contain"
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-gray-900 font-medium truncate max-w-[200px]" title={image.fileName}>
                            {image.fileName}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-gray-700">{getImageDisplayName(image)}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            image.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                            image.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                            image.status === 'COMPLETED' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {image.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-gray-700">v{image.version}</p>
                        </td>
                        <td className="px-4 py-3">
                          {image.sourceImage ? (
                            <span className="text-xs text-purple-600">{image.sourceImage.variant}</span>
                          ) : image.parentImage ? (
                            <span className="text-xs text-orange-600">Regen v{image.parentImage.version}</span>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleDeleteImage(image.id)}
                              disabled={deletingImageId === image.id}
                              className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition disabled:opacity-50"
                              title="Delete"
                            >
                              {deletingImageId === image.id ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                              ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              )}
                            </button>
                            <button
                              onClick={() => downloadImage(getImageUrl(image), image.fileName)}
                              className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                              title="Download"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                            </button>
                            <button
                              onClick={() => openRegenerateModal(image.id, getImageDisplayName(image))}
                              className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                              title="Regenerate"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
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
