"use client"

import { useEffect, useState } from "react"

interface TemplateVariable {
  id: string
  name: string
  displayName: string
  type: "TEXT" | "DROPDOWN" | "AUTO"
  isRequired: boolean
  defaultValue: string | null
  options: string[]
  autoFillSource: string | null
  order: number
}

interface Template {
  id: string
  name: string
  description: string | null
  promptText: string
  category: string
  variables: TemplateVariable[]
}

interface Product {
  id: string
  title: string
  category?: string | null
  asin?: string | null
}

interface TemplateSelectorProps {
  category: "image" | "video" | "both"
  product?: Product
  onPromptGenerated: (prompt: string | null, templateId: string | null) => void
}

export default function TemplateSelector({ category, product, onPromptGenerated }: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [variableValues, setVariableValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    loadTemplates()
  }, [category])

  useEffect(() => {
    // Auto-fill product values when template or product changes
    if (selectedTemplate && product) {
      const autoValues: Record<string, string> = {}
      for (const variable of selectedTemplate.variables) {
        if (variable.type === "AUTO" && variable.autoFillSource) {
          if (variable.autoFillSource === "product.title") {
            autoValues[variable.name] = product.title
          } else if (variable.autoFillSource === "product.category" && product.category) {
            autoValues[variable.name] = product.category
          } else if (variable.autoFillSource === "product.asin" && product.asin) {
            autoValues[variable.name] = product.asin
          }
        }
      }
      setVariableValues(prev => ({ ...prev, ...autoValues }))
    }
  }, [selectedTemplate, product])

  useEffect(() => {
    // Generate prompt whenever variables change
    if (selectedTemplate) {
      const prompt = renderPrompt()
      onPromptGenerated(prompt, selectedTemplate.id)
    }
  }, [variableValues, selectedTemplate])

  const loadTemplates = async () => {
    try {
      const categoryParam = category === "both" ? "" : `?category=${category}`
      const response = await fetch(`/api/templates${categoryParam}`)
      if (response.ok) {
        const data = await response.json()
        // Filter templates that match category or are "both"
        const filtered = data.filter((t: Template) =>
          t.category === "both" || t.category === category
        )
        setTemplates(filtered)
      }
    } catch (error) {
      console.error("Error loading templates:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleTemplateSelect = (template: Template | null) => {
    setSelectedTemplate(template)
    if (template) {
      // Initialize with default values
      const defaults: Record<string, string> = {}
      for (const variable of template.variables) {
        if (variable.defaultValue) {
          defaults[variable.name] = variable.defaultValue
        }
      }
      setVariableValues(defaults)
      setExpanded(true)
    } else {
      setVariableValues({})
      onPromptGenerated(null, null)
    }
  }

  const renderPrompt = (): string => {
    if (!selectedTemplate) return ""

    let prompt = selectedTemplate.promptText
    for (const variable of selectedTemplate.variables) {
      const value = variableValues[variable.name] || ""
      prompt = prompt.replace(new RegExp(`\\{\\{${variable.name}\\}\\}`, "g"), value)
    }
    return prompt
  }

  const getMissingRequired = (): string[] => {
    if (!selectedTemplate) return []
    return selectedTemplate.variables
      .filter(v => v.isRequired && !variableValues[v.name])
      .map(v => v.displayName)
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-10 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  if (templates.length === 0) {
    return null
  }

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Use Prompt Template (Optional)
        </h2>
        {selectedTemplate && (
          <button
            onClick={() => handleTemplateSelect(null)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Clear template
          </button>
        )}
      </div>

      {/* Template Selector */}
      <div className="mb-4">
        <select
          value={selectedTemplate?.id || ""}
          onChange={(e) => {
            const template = templates.find(t => t.id === e.target.value) || null
            handleTemplateSelect(template)
          }}
          className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="">Select a template...</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name} ({template.variables.length} variables)
            </option>
          ))}
        </select>
      </div>

      {/* Quick Templates */}
      {!selectedTemplate && templates.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="text-sm text-gray-500">Quick select:</span>
          {templates.slice(0, 3).map((template) => (
            <button
              key={template.id}
              onClick={() => handleTemplateSelect(template)}
              className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200"
            >
              {template.name}
            </button>
          ))}
        </div>
      )}

      {/* Variable Inputs */}
      {selectedTemplate && expanded && (
        <div className="border-t pt-4 mt-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-medium text-gray-700">
              Fill in Variables
            </h3>
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              {expanded ? "Collapse" : "Expand"}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {selectedTemplate.variables.map((variable) => (
              <div key={variable.id}>
                <label className="block text-sm text-gray-600 mb-1">
                  {variable.displayName}
                  {variable.isRequired && <span className="text-red-500 ml-1">*</span>}
                  {variable.type === "AUTO" && (
                    <span className="text-cyan-600 ml-1 text-xs">(auto-filled)</span>
                  )}
                </label>

                {variable.type === "DROPDOWN" && variable.options.length > 0 ? (
                  <select
                    value={variableValues[variable.name] || ""}
                    onChange={(e) => setVariableValues(prev => ({
                      ...prev,
                      [variable.name]: e.target.value
                    }))}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select {variable.displayName.toLowerCase()}...</option>
                    {variable.options.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={variableValues[variable.name] || ""}
                    onChange={(e) => setVariableValues(prev => ({
                      ...prev,
                      [variable.name]: e.target.value
                    }))}
                    placeholder={variable.defaultValue || `Enter ${variable.displayName.toLowerCase()}`}
                    disabled={variable.type === "AUTO"}
                    className={`w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      variable.type === "AUTO" ? "bg-gray-50 text-gray-500" : ""
                    }`}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Missing Required Warning */}
          {getMissingRequired().length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded px-3 py-2 mb-4">
              <p className="text-sm text-yellow-700">
                Missing required: {getMissingRequired().join(", ")}
              </p>
            </div>
          )}

          {/* Preview */}
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs text-gray-500 mb-2">Generated Prompt Preview:</p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">
              {renderPrompt() || <span className="text-gray-400 italic">Fill in variables to see preview</span>}
            </p>
          </div>
        </div>
      )}

      {/* Template Info */}
      {selectedTemplate && !expanded && (
        <div className="bg-blue-50 rounded px-3 py-2">
          <p className="text-sm text-blue-700">
            Template "{selectedTemplate.name}" selected with {selectedTemplate.variables.length} variables.
            <button
              onClick={() => setExpanded(true)}
              className="ml-2 underline hover:no-underline"
            >
              Edit values
            </button>
          </p>
        </div>
      )}
    </div>
  )
}
