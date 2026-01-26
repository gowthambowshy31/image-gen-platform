"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import ImageSelector from "@/app/components/ImageSelector"
import TemplateSelector from "@/app/components/TemplateSelector"

interface ImageType {
  id: string
  name: string
  description: string
  defaultPrompt: string
}

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
  fileName: string
  filePath: string
  width: number
  height: number
  imageType: {
    id: string
    name: string
  }
  status: string
}

interface Product {
  id: string
  title: string
  asin?: string
  category?: string
  sourceImages: SourceImage[]
  images?: GeneratedImage[]
}

export default function GenerateImagesPage() {
  const params = useParams()
  const router = useRouter()
  const [product, setProduct] = useState<Product | null>(null)
  const [imageTypes, setImageTypes] = useState<ImageType[]>([])
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set())
  const [selectedSourceImage, setSelectedSourceImage] = useState<string>("")
  const [selectedGeneratedImage, setSelectedGeneratedImage] = useState<string>("")
  const [customPrompt, setCustomPrompt] = useState<string>("")
  const [templatePrompt, setTemplatePrompt] = useState<string | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState<string>("")

  useEffect(() => {
    loadData()
  }, [params.id])

  const loadData = async () => {
    try {
      const [productRes, typesRes] = await Promise.all([
        fetch(`/api/products/${params.id}`),
        fetch('/api/image-types')
      ])

      if (productRes.ok) {
        const productData = await productRes.json()
        setProduct(productData)
      }

      if (typesRes.ok) {
        const typesData = await typesRes.json()
        setImageTypes(typesData)
      }
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleType = (typeId: string) => {
    const newSelected = new Set(selectedTypes)
    if (newSelected.has(typeId)) {
      newSelected.delete(typeId)
    } else {
      newSelected.add(typeId)
    }
    setSelectedTypes(newSelected)
  }

  const selectAll = () => {
    setSelectedTypes(new Set(imageTypes.map(t => t.id)))
  }

  const deselectAll = () => {
    setSelectedTypes(new Set())
  }

  const generateImages = async () => {
    if (!product || selectedTypes.size === 0) return

    setGenerating(true)
    const typesArray = Array.from(selectedTypes)
    let successCount = 0
    let failCount = 0

    try {
      // Generate images one by one
      for (let i = 0; i < typesArray.length; i++) {
        const typeId = typesArray[i]
        const typeName = imageTypes.find(t => t.id === typeId)?.name || 'Image'

        setProgress(`Generating ${i + 1}/${typesArray.length}: ${typeName}...`)

        try {
          const requestBody: any = {
            productId: product.id,
            imageTypeId: typeId
          }

          // Add optional source image if selected (Amazon images take priority)
          if (selectedSourceImage) {
            requestBody.sourceImageId = selectedSourceImage
          } else if (selectedGeneratedImage) {
            // Use generated image if no Amazon image selected
            requestBody.generatedImageId = selectedGeneratedImage
          }

          // Build the final prompt: template + custom additions
          const finalPrompt = [templatePrompt, customPrompt.trim()].filter(Boolean).join("\n\n")
          if (finalPrompt) {
            requestBody.customPrompt = finalPrompt
          }

          // Track template usage if a template was selected
          if (selectedTemplateId) {
            requestBody.templateId = selectedTemplateId
          }

          const response = await fetch('/api/images/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
          })

          if (response.ok) {
            successCount++
          } else {
            failCount++
            console.error(`Failed to generate ${typeName}`)
          }
        } catch (err) {
          failCount++
          console.error(`Error generating ${typeName}:`, err)
        }
      }

      if (successCount > 0) {
        setProgress(`✅ Successfully generated ${successCount} image${successCount !== 1 ? 's' : ''}!${failCount > 0 ? ` (${failCount} failed)` : ''}`)

        setTimeout(() => {
          router.push(`/products/${product.id}`)
        }, 2000)
      } else {
        setProgress(`❌ Failed to generate images. Please try again.`)
      }
    } catch (error) {
      setProgress(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setGenerating(false)
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

  if (!product) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Product not found</h2>
          <Link href="/dashboard" className="text-blue-600 hover:underline">
            Back to Dashboard
          </Link>
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
              <Link href={`/products/${product.id}`} className="text-gray-600 hover:text-gray-900">
                ← Back
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Generate Images</h1>
            </div>
            <Link
              href={`/products/${product.id}/generate-video`}
              className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg hover:from-purple-600 hover:to-pink-700 font-semibold shadow-lg"
            >
              🎬 Generate Video
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Product Info */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-2">{product.title}</h2>
          <p className="text-sm text-gray-500">
            ASIN: {product.asin} | {product.sourceImages?.length || 0} source images available
          </p>
        </div>

        {/* Amazon Source Image Selection */}
        {product.sourceImages && product.sourceImages.length > 0 && (
          <ImageSelector
            title="Amazon Source Images"
            description="Choose a specific Amazon product image to use as the base for generation, or leave unselected to use the default."
            images={product.sourceImages.map(img => ({
              id: img.id,
              url: img.localFilePath,
              label: img.variant,
              width: img.width,
              height: img.height
            }))}
            selectedImageId={selectedSourceImage}
            onSelect={(id) => {
              setSelectedSourceImage(id)
              if (id) setSelectedGeneratedImage("") // Clear generated image selection
            }}
          />
        )}

        {/* Generated Images Selection */}
        {product.images && product.images.length > 0 && (
          <ImageSelector
            title="AI Generated Images"
            description="Select a previously generated image to use as the base for creating new images with different templates."
            images={product.images
              .filter(img => img.status === 'COMPLETED')
              .map(img => ({
                id: img.id,
                url: img.filePath?.startsWith('http') ? img.filePath : `/uploads/${img.fileName}`,
                label: img.imageType.name,
                sublabel: `v${img.imageType.name}`,
                width: img.width,
                height: img.height
              }))}
            selectedImageId={selectedGeneratedImage}
            onSelect={(id) => {
              setSelectedGeneratedImage(id)
              if (id) setSelectedSourceImage("") // Clear Amazon image selection
            }}
            emptyMessage="No completed generated images available yet. Generate some images first!"
          />
        )}

        {/* Template Selector */}
        {product && (
          <TemplateSelector
            category="image"
            product={{
              id: product.id,
              title: product.title,
              category: product.category,
              asin: product.asin
            }}
            onPromptGenerated={(prompt, templateId) => {
              setTemplatePrompt(prompt)
              setSelectedTemplateId(templateId)
            }}
          />
        )}

        {/* Custom Prompt */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {templatePrompt ? "Additional Instructions (Optional)" : "Custom Prompt (Optional)"}
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            {templatePrompt
              ? "Add any additional instructions to combine with the template prompt above."
              : "Add specific instructions for the AI (e.g., \"make the diamond smaller\", \"increase product size\", \"brighter lighting\"). This will be combined with the image type's default prompt."
            }
          </p>
          <textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder={templatePrompt ? "Additional instructions (optional)..." : "Enter custom instructions here..."}
            className="w-full border border-gray-300 rounded-lg p-3 min-h-[100px] focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Image Type Selection */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Select Image Types to Generate</h2>
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded"
              >
                Select All
              </button>
              <button
                onClick={deselectAll}
                className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-50 rounded"
              >
                Deselect All
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {imageTypes.map((type) => (
              <div
                key={type.id}
                onClick={() => toggleType(type.id)}
                className={`border-2 rounded-lg p-4 cursor-pointer transition ${
                  selectedTypes.has(type.id)
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-gray-900">{type.name}</h3>
                  <input
                    type="checkbox"
                    checked={selectedTypes.has(type.id)}
                    onChange={() => {}}
                    className="mt-1"
                  />
                </div>
                <p className="text-sm text-gray-600">{type.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Generation Progress */}
        {progress && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <p className="text-center text-gray-700">{progress}</p>
          </div>
        )}

        {/* Generate Button */}
        <div className="flex justify-center">
          <button
            onClick={generateImages}
            disabled={generating || selectedTypes.size === 0}
            className={`px-8 py-3 rounded-lg font-semibold text-white transition ${
              generating || selectedTypes.size === 0
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {generating ? (
              <span className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Generating...
              </span>
            ) : (
              `Generate ${selectedTypes.size} Image${selectedTypes.size !== 1 ? 's' : ''}`
            )}
          </button>
        </div>

        {/* Info Box */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">How it works:</h3>
          <ul className="list-disc list-inside text-sm text-blue-800 space-y-1">
            <li>Select the types of images you want to generate</li>
            <li>AI will analyze your product's source images from Amazon</li>
            <li>New marketing images will be created based on the selected types</li>
            <li>Generated images will appear on the product detail page for review</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
