import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { assets as assetsApi, ApiError } from '../../api/client'
import { ErrorMessage } from '../../components/Ui'

export default function CreateAsset() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [entryFile, setEntryFile] = useState('')
  const [description, setDescription] = useState('')
  const [tagsStr, setTagsStr] = useState('')
  const [depsStr, setDepsStr] = useState('')
  const [toolsStr, setToolsStr] = useState('')
  const [price, setPrice] = useState('0')
  const [licenseType, setLicenseType] = useState('MIT')
  const [evolutionNote, setEvolutionNote] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const parseCsv = (s: string) =>
    s.split(',').map((t) => t.trim()).filter(Boolean)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!file) {
      setError('Please select a zip file to upload.')
      return
    }
    if (!name.trim()) {
      setError('Asset name is required.')
      return
    }
    setSubmitting(true)
    try {
      const asset = await assetsApi.publish({
        file,
        name: name.trim(),
        entry_file: entryFile.trim() || undefined,
        description: description.trim() || undefined,
        tags: parseCsv(tagsStr).length ? parseCsv(tagsStr) : undefined,
        dependencies: parseCsv(depsStr).length ? parseCsv(depsStr) : undefined,
        tools_used: parseCsv(toolsStr).length ? parseCsv(toolsStr) : undefined,
        price: parseFloat(price) || 0,
        license_type: licenseType || undefined,
        evolution_note: evolutionNote.trim() || undefined,
      })
      navigate(`/marketplace/${asset.id}`)
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        setError(e.message)
      } else {
        setError(e instanceof Error ? e.message : 'Upload failed')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) setFile(f)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-charcoal-800 mb-1">Publish Asset</h1>
        <p className="text-charcoal-400">Upload a reusable asset package as a zip archive to the marketplace.</p>
      </div>

      {error && <div className="mb-6"><ErrorMessage message={error} /></div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Zip file */}
        <div>
          <label className="block text-sm font-medium text-charcoal-600 mb-1.5">
            Archive (.zip) *
          </label>
          <div
            onClick={() => fileRef.current?.click()}
            className="card p-6 text-center cursor-pointer hover:border-sage-300 transition-colors"
          >
            <input
              ref={fileRef}
              type="file"
              accept=".zip,application/zip"
              onChange={handleFileChange}
              className="hidden"
            />
            {file ? (
              <div>
                <div className="font-mono text-sm text-sage-700 mb-1">{file.name}</div>
                <div className="text-xs text-charcoal-400">{(file.size / 1024).toFixed(1)} KB</div>
              </div>
            ) : (
              <div>
                <svg className="w-8 h-8 mx-auto mb-2 text-charcoal-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <p className="text-sm text-charcoal-500">Click to select a .zip file</p>
                <p className="text-xs text-charcoal-300 mt-1">Include SKILL.md for a public preview</p>
              </div>
            )}
          </div>
        </div>

        {/* Name & Entry file */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-charcoal-600 mb-1.5">
              Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-subagent"
              className="input"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal-600 mb-1.5">
              Entry file <span className="text-charcoal-300">(optional)</span>
            </label>
            <input
              type="text"
              value={entryFile}
              onChange={(e) => setEntryFile(e.target.value)}
              placeholder="main.py"
              className="input font-mono text-sm"
            />
            <p className="text-xs text-charcoal-300 mt-1">
              Leave blank for non-executable assets. If provided, it must exist inside the zip.
            </p>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-charcoal-600 mb-1.5">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="What reusable capability does this asset provide?"
            className="input"
          />
        </div>

        {/* Tags & Dependencies */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-charcoal-600 mb-1.5">
              Tags <span className="text-charcoal-300">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={tagsStr}
              onChange={(e) => setTagsStr(e.target.value)}
              placeholder="research, web, nlp"
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal-600 mb-1.5">
              Dependencies <span className="text-charcoal-300">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={depsStr}
              onChange={(e) => setDepsStr(e.target.value)}
              placeholder="requests, beautifulsoup4"
              className="input"
            />
          </div>
        </div>

        {/* Tools used */}
        <div>
          <label className="block text-sm font-medium text-charcoal-600 mb-1.5">
            Tools used <span className="text-charcoal-300">(comma-separated)</span>
          </label>
          <input
            type="text"
            value={toolsStr}
            onChange={(e) => setToolsStr(e.target.value)}
            placeholder="web_search, code_interpreter"
            className="input"
          />
        </div>

        {/* Price & License */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-charcoal-600 mb-1.5">
              Price (credits)
            </label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              min="0"
              step="0.1"
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal-600 mb-1.5">
              License
            </label>
            <select
              value={licenseType}
              onChange={(e) => setLicenseType(e.target.value)}
              className="input"
            >
              <option value="MIT">MIT</option>
              <option value="Apache-2.0">Apache 2.0</option>
              <option value="GPL-3.0">GPL 3.0</option>
              <option value="BSD-3-Clause">BSD 3-Clause</option>
              <option value="proprietary">Proprietary</option>
            </select>
          </div>
        </div>

        {/* Evolution note */}
        <div>
          <label className="block text-sm font-medium text-charcoal-600 mb-1.5">
            Evolution note <span className="text-charcoal-300">(optional)</span>
          </label>
          <input
            type="text"
            value={evolutionNote}
            onChange={(e) => setEvolutionNote(e.target.value)}
            placeholder="Improved accuracy over v1 by switching to GPT-4o"
            className="input"
          />
        </div>

        {/* Submit */}
        <div className="flex items-center gap-4 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary"
          >
            {submitting ? 'Uploading...' : 'Publish Asset'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/dashboard/assets')}
            className="btn-ghost"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
