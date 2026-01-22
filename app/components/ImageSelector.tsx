"use client"

interface Image {
  id: string
  url: string
  label: string
  sublabel?: string
  width?: number
  height?: number
}

interface ImageSelectorProps {
  images: Image[]
  selectedImageId: string
  onSelect: (imageId: string) => void
  title: string
  description?: string
  emptyMessage?: string
}

export default function ImageSelector({
  images,
  selectedImageId,
  onSelect,
  title,
  description,
  emptyMessage = "No images available"
}: ImageSelectorProps) {
  if (images.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>
        {description && <p className="text-sm text-gray-600 mb-4">{description}</p>}
        <p className="text-sm text-gray-500 italic text-center py-8">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>
      {description && <p className="text-sm text-gray-600 mb-4">{description}</p>}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {images.map((img) => (
          <div
            key={img.id}
            onClick={() => onSelect(selectedImageId === img.id ? "" : img.id)}
            className={`relative border-2 rounded-lg p-2 cursor-pointer transition ${
              selectedImageId === img.id
                ? 'border-green-600 bg-green-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <img
              src={img.url}
              alt={img.label}
              className="w-full h-32 object-contain mb-2"
            />
            <div className="text-xs text-center">
              <p className="font-semibold text-gray-700">{img.label}</p>
              {img.sublabel && <p className="text-gray-500">{img.sublabel}</p>}
              {img.width && img.height && (
                <p className="text-gray-400">{img.width}x{img.height}</p>
              )}
            </div>
            {selectedImageId === img.id && (
              <div className="absolute top-2 right-2 bg-green-600 text-white rounded-full w-6 h-6 flex items-center justify-center">
                ✓
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
