"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

interface TemplateVariable {
  id: string
  name: string
  displayName: string
  type: "TEXT" | "DROPDOWN" | "AUTO"
}

interface Template {
  id: string
  name: string
  description: string | null
  promptText: string
  category: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  variables: TemplateVariable[]
  _count: {
    usageHistory: number
  }
}

interface Product {
  id: string
  title: string
  asin?: string
}

export default function TemplatesPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [showProductSelector, setShowProductSelector] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [productSearch, setProductSearch] = useState("")

  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    try {
      const response = await fetch("/api/templates")
      if (response.ok) {
        const data = await response.json()
        setTemplates(data)
      }
    } catch (error) {
      console.error("Error loading templates:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleDuplicate = async (id: string) => {
    try {
      const response = await fetch(`/api/templates/${id}/duplicate`, {
        method: "POST"
      })
      if (response.ok) {
        const newTemplate = await response.json()
        setTemplates(prev => [newTemplate, ...prev])
      }
    } catch (error) {
      console.error("Error duplicating template:", error)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return

    try {
      const response = await fetch(`/api/templates/${id}`, {
        method: "DELETE"
      })
      if (response.ok) {
        setTemplates(prev => prev.filter(t => t.id !== id))
      }
    } catch (error) {
      console.error("Error deleting template:", error)
    }
  }

  const handleUseTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId)
    setShowProductSelector(true)
    loadProducts()
  }

  const loadProducts = async () => {
    setProductsLoading(true)
    try {
      const response = await fetch("/api/products")
      if (response.ok) {
        const data = await response.json()
        setProducts(data)
      }
    } catch (error) {
      console.error("Error loading products:", error)
    } finally {
      setProductsLoading(false)
    }
  }

  const handleProductSelect = (productId: string) => {
    if (selectedTemplateId) {
      const template = templates.find(t => t.id === selectedTemplateId)
      if (template) {
        // Navigate to generate page with template ID
        const category = template.category === "both" ? "image" : template.category
        router.push(`/products/${productId}/generate${category === "video" ? "-video" : ""}?templateId=${selectedTemplateId}`)
      }
    }
  }

  const filteredProducts = products.filter(p =>
    p.title.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.asin && p.asin.toLowerCase().includes(productSearch.toLowerCase()))
  )

  const filteredTemplates = templates.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.description?.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchesCategory = categoryFilter === "all" || t.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  const getCategoryBadge = (category: string) => {
    const colors: Record<string, string> = {
      image: "bg-blue-100 text-blue-800",
      video: "bg-purple-100 text-purple-800",
      both: "bg-green-100 text-green-800"
    }
    return colors[category] || "bg-gray-100 text-gray-800"
  }

  const getVariableTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      TEXT: "bg-gray-100 text-gray-600",
      DROPDOWN: "bg-yellow-100 text-yellow-700",
      AUTO: "bg-cyan-100 text-cyan-700"
    }
    return colors[type] || "bg-gray-100 text-gray-600"
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading templates...</p>
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
                &larr; Dashboard
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Prompt Templates</h1>
            </div>
            <Link
              href="/templates/new"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
            >
              + Create Template
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Categories</option>
                <option value="image">Image Only</option>
                <option value="video">Video Only</option>
                <option value="both">Both</option>
              </select>
            </div>
          </div>
        </div>

        {/* Templates Grid */}
        {filteredTemplates.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="text-gray-400 text-6xl mb-4">📝</div>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">No templates yet</h2>
            <p className="text-gray-500 mb-6">
              Create your first prompt template with dynamic variables
            </p>
            <Link
              href="/templates/new"
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
            >
              Create Your First Template
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTemplates.map((template) => (
              <div
                key={template.id}
                className="bg-white rounded-lg shadow hover:shadow-md transition-shadow"
              >
                <div className="p-6">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-gray-900 text-lg">{template.name}</h3>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getCategoryBadge(template.category)}`}>
                      {template.category}
                    </span>
                  </div>

                  {/* Description */}
                  {template.description && (
                    <p className="text-sm text-gray-600 mb-4 line-clamp-2">{template.description}</p>
                  )}

                  {/* Prompt Preview */}
                  <div className="bg-gray-50 rounded p-3 mb-4">
                    <p className="text-xs text-gray-500 font-mono line-clamp-3">
                      {template.promptText}
                    </p>
                  </div>

                  {/* Variables */}
                  <div className="mb-4">
                    <p className="text-xs text-gray-500 mb-2">
                      {template.variables.length} variable{template.variables.length !== 1 ? "s" : ""}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {template.variables.slice(0, 4).map((v) => (
                        <span
                          key={v.id}
                          className={`px-2 py-0.5 rounded text-xs ${getVariableTypeBadge(v.type)}`}
                        >
                          {v.displayName}
                        </span>
                      ))}
                      {template.variables.length > 4 && (
                        <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                          +{template.variables.length - 4} more
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <p className="text-xs text-gray-400 mb-4">
                    Used {template._count.usageHistory} time{template._count.usageHistory !== 1 ? "s" : ""}
                  </p>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 pt-4 border-t">
                    <button
                      onClick={() => handleUseTemplate(template.id)}
                      className="w-full px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
                    >
                      Use Template
                    </button>
                    <div className="flex gap-2">
                      <Link
                        href={`/templates/${template.id}/edit`}
                        className="flex-1 px-3 py-2 text-center text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => handleDuplicate(template.id)}
                        className="flex-1 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                      >
                        Duplicate
                      </button>
                      <button
                        onClick={() => handleDelete(template.id, template.name)}
                        className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Info Box */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">About Prompt Templates</h3>
          <ul className="list-disc list-inside text-sm text-blue-800 space-y-1">
            <li>Create reusable prompts with dynamic variables like {"{{item_name}}"} or {"{{style}}"}</li>
            <li>Variables can be text inputs, dropdown selections, or auto-filled from product data</li>
            <li>Use templates during image/video generation to quickly create consistent prompts</li>
          </ul>
        </div>
      </div>

      {/* Product Selector Modal */}
      {showProductSelector && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="p-6 border-b">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-900">Select a Product</h2>
                <button
                  onClick={() => {
                    setShowProductSelector(false)
                    setSelectedTemplateId(null)
                    setProductSearch("")
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              <p className="text-sm text-gray-600 mt-2">
                Choose a product to generate images/videos with this template
              </p>
            </div>
            <div className="p-6 flex-1 overflow-hidden flex flex-col">
              <input
                type="text"
                placeholder="Search products..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 mb-4 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <div className="flex-1 overflow-y-auto">
                {productsLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-600">Loading products...</p>
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500">No products found</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredProducts.map((product) => (
                      <button
                        key={product.id}
                        onClick={() => handleProductSelect(product.id)}
                        className="w-full text-left p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition"
                      >
                        <h3 className="font-semibold text-gray-900">{product.title}</h3>
                        {product.asin && (
                          <p className="text-sm text-gray-500 mt-1">ASIN: {product.asin}</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
