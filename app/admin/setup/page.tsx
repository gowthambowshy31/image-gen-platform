"use client"

import { useState, useEffect } from "react"

interface DatabaseStatus {
  initialized: boolean
  counts: {
    users: number
    products: number
    imageTypes: number
  }
}

export default function AdminSetupPage() {
  const [status, setStatus] = useState<DatabaseStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/admin/setup-database")
      const data = await res.json()
      setStatus(data)
    } catch (error) {
      setMessage({ type: "error", text: "Failed to fetch database status" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus()
  }, [])

  const initializeDatabase = async () => {
    setActionLoading("init")
    setMessage(null)
    try {
      const res = await fetch("/api/admin/setup-database", { method: "POST" })
      const data = await res.json()
      if (data.success) {
        setMessage({ type: "success", text: "Database initialized successfully!" })
        fetchStatus()
      } else {
        setMessage({ type: "error", text: data.message || data.error || "Failed to initialize" })
      }
    } catch (error) {
      setMessage({ type: "error", text: "Failed to initialize database" })
    } finally {
      setActionLoading(null)
    }
  }

  const importAmazonProducts = async () => {
    setActionLoading("import")
    setMessage(null)
    try {
      const res = await fetch("/api/admin/import-amazon-products", { method: "POST" })
      const data = await res.json()
      if (data.success || data.processed > 0) {
        setMessage({
          type: "success",
          text: `Imported ${data.processed || 0} products. Skipped: ${data.skipped || 0}, Errors: ${data.errors || 0}`
        })
        fetchStatus()
      } else {
        setMessage({ type: "error", text: data.error || "Failed to import products" })
      }
    } catch (error) {
      setMessage({ type: "error", text: "Failed to import Amazon products" })
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">Admin Setup</h1>

        {message && (
          <div className={`p-4 rounded-lg mb-6 ${
            message.type === "success" ? "bg-green-900 text-green-200" : "bg-red-900 text-red-200"
          }`}>
            {message.text}
          </div>
        )}

        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4">Database Status</h2>
          {status ? (
            <div className="space-y-2 text-gray-300">
              <p>
                Status:{" "}
                <span className={status.initialized ? "text-green-400" : "text-yellow-400"}>
                  {status.initialized ? "Initialized" : "Not Initialized"}
                </span>
              </p>
              <p>Users: {status.counts.users}</p>
              <p>Products: {status.counts.products}</p>
              <p>Image Types: {status.counts.imageTypes}</p>
            </div>
          ) : (
            <p className="text-red-400">Could not fetch status</p>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-medium text-white mb-2">1. Initialize Database</h3>
            <p className="text-gray-400 text-sm mb-4">
              Creates admin user (admin@example.com / admin123) and default image/video types.
            </p>
            <button
              onClick={initializeDatabase}
              disabled={actionLoading !== null || status?.initialized}
              className={`px-4 py-2 rounded-lg font-medium ${
                status?.initialized
                  ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700 text-white"
              } ${actionLoading === "init" ? "opacity-50" : ""}`}
            >
              {actionLoading === "init" ? "Initializing..." : status?.initialized ? "Already Initialized" : "Initialize Database"}
            </button>
          </div>

          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-medium text-white mb-2">2. Import Amazon Products</h3>
            <p className="text-gray-400 text-sm mb-4">
              Fetches your FBA inventory from Amazon and imports products with their images.
              This may take several minutes for large inventories.
            </p>
            <button
              onClick={importAmazonProducts}
              disabled={actionLoading !== null || !status?.initialized}
              className={`px-4 py-2 rounded-lg font-medium ${
                !status?.initialized
                  ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                  : "bg-green-600 hover:bg-green-700 text-white"
              } ${actionLoading === "import" ? "opacity-50" : ""}`}
            >
              {actionLoading === "import" ? "Importing... (this may take a while)" : "Import Amazon Products"}
            </button>
          </div>

          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-medium text-white mb-2">3. Go to Dashboard</h3>
            <p className="text-gray-400 text-sm mb-4">
              Once setup is complete, go to the main dashboard to start generating images.
            </p>
            <a
              href="/dashboard"
              className="inline-block px-4 py-2 rounded-lg font-medium bg-purple-600 hover:bg-purple-700 text-white"
            >
              Go to Dashboard
            </a>
          </div>
        </div>

        <div className="mt-8 p-4 bg-gray-800 rounded-lg">
          <h3 className="text-lg font-medium text-white mb-2">Login Credentials</h3>
          <p className="text-gray-400 text-sm">
            After initialization, use these credentials to login:
          </p>
          <div className="mt-2 font-mono text-sm text-gray-300">
            <p>Email: admin@example.com</p>
            <p>Password: admin123</p>
          </div>
        </div>
      </div>
    </div>
  )
}
