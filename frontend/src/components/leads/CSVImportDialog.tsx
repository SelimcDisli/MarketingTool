import { useState, useCallback, useMemo } from 'react'
import Papa from 'papaparse'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Upload, ArrowRight, Check, X, FileSpreadsheet, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    activeListId?: string | null
    lists: { id: string; name: string }[]
    onImportComplete: () => void
}

const TARGET_FIELDS = [
    { value: '', label: '-- Skip --' },
    { value: 'email', label: 'Email *' },
    { value: 'firstName', label: 'First Name' },
    { value: 'lastName', label: 'Last Name' },
    { value: 'company', label: 'Company' },
    { value: 'jobTitle', label: 'Job Title' },
    { value: 'phone', label: 'Phone' },
    { value: 'website', label: 'Website' },
    { value: 'location', label: 'Location' },
    { value: 'linkedinUrl', label: 'LinkedIn URL' },
]

// Fuzzy match CSV headers to target fields
function autoDetectMapping(header: string): string {
    const h = header.toLowerCase().trim()
    const map: Record<string, string> = {
        email: 'email', 'e-mail': 'email', email_address: 'email',
        firstname: 'firstName', first_name: 'firstName', 'first name': 'firstName', first: 'firstName', vorname: 'firstName',
        lastname: 'lastName', last_name: 'lastName', 'last name': 'lastName', last: 'lastName', nachname: 'lastName',
        company: 'company', company_name: 'company', firma: 'company', unternehmen: 'company',
        jobtitle: 'jobTitle', job_title: 'jobTitle', 'job title': 'jobTitle', title: 'jobTitle', position: 'jobTitle',
        phone: 'phone', phone_number: 'phone', telefon: 'phone',
        website: 'website', url: 'website', webseite: 'website',
        location: 'location', city: 'location', ort: 'location', standort: 'location',
        linkedinurl: 'linkedinUrl', linkedin: 'linkedinUrl', linkedin_url: 'linkedinUrl',
    }
    return map[h] || ''
}

export function CSVImportDialog({ open, onOpenChange, activeListId, lists, onImportComplete }: Props) {
    const [step, setStep] = useState<'upload' | 'mapping'>('upload')
    const [file, setFile] = useState<File | null>(null)
    const [headers, setHeaders] = useState<string[]>([])
    const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([])
    const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
    const [listName, setListName] = useState('')
    const [selectedListId, setSelectedListId] = useState(activeListId || '')
    const [importing, setImporting] = useState(false)

    const reset = useCallback(() => {
        setStep('upload')
        setFile(null)
        setHeaders([])
        setPreviewRows([])
        setColumnMapping({})
        setListName('')
        setImporting(false)
    }, [])

    const handleFile = useCallback((f: File) => {
        setFile(f)
        Papa.parse(f, {
            header: true,
            preview: 5,
            skipEmptyLines: true,
            complete: (results) => {
                if (!results.meta.fields?.length) {
                    toast.error('Could not detect CSV columns')
                    return
                }
                const fields = results.meta.fields
                setHeaders(fields)
                setPreviewRows(results.data as Record<string, string>[])
                // Auto-detect mappings
                const mapping: Record<string, string> = {}
                fields.forEach(h => {
                    mapping[h] = autoDetectMapping(h)
                })
                setColumnMapping(mapping)
                setStep('mapping')
            },
            error: () => toast.error('Failed to parse CSV'),
        })
    }, [])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        const f = e.dataTransfer.files[0]
        if (f && f.name.endsWith('.csv')) handleFile(f)
        else toast.error('Please drop a .csv file')
    }, [handleFile])

    const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]
        if (f) handleFile(f)
    }, [handleFile])

    const emailMapped = useMemo(() => Object.values(columnMapping).includes('email'), [columnMapping])

    const handleImport = useCallback(async () => {
        if (!file || !emailMapped) return
        setImporting(true)
        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('columnMapping', JSON.stringify(columnMapping))
            if (selectedListId) {
                formData.append('listId', selectedListId)
            } else if (listName.trim()) {
                formData.append('listName', listName.trim())
            }
            const { data } = await api.post('/leads/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            })
            const r = data.results || data
            toast.success(`Imported ${r.created || 0} leads! (${r.skipped || 0} skipped, ${r.invalid || 0} invalid)`)
            onImportComplete()
            onOpenChange(false)
            reset()
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Import failed')
        } finally {
            setImporting(false)
        }
    }, [file, emailMapped, columnMapping, selectedListId, listName, onImportComplete, onOpenChange, reset])

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileSpreadsheet className="w-5 h-5 text-primary-600" />
                        {step === 'upload' ? 'Import Leads from CSV' : 'Map CSV Columns'}
                    </DialogTitle>
                </DialogHeader>

                {step === 'upload' && (
                    <div className="space-y-4 pt-2">
                        <div
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={handleDrop}
                            className="relative border-2 border-dashed border-slate-200 rounded-xl p-10 text-center hover:border-primary-400 hover:bg-primary-50/30 transition-all cursor-pointer group"
                        >
                            <Upload className="w-10 h-10 text-slate-300 mx-auto mb-3 group-hover:text-primary-400 transition-colors" />
                            <p className="text-sm font-medium text-slate-700 mb-1">Drop your CSV file here</p>
                            <p className="text-xs text-slate-400 mb-3">or click to browse</p>
                            <input
                                type="file"
                                accept=".csv"
                                onChange={handleFileInput}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <Button variant="outline" size="sm" className="pointer-events-none">
                                <Upload className="w-3.5 h-3.5" /> Choose File
                            </Button>
                        </div>
                        <p className="text-xs text-slate-400 text-center">
                            CSV files up to 20MB. Column headers will be automatically detected.
                        </p>
                    </div>
                )}

                {step === 'mapping' && (
                    <div className="space-y-4 pt-2">
                        {/* File info */}
                        <div className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-lg">
                            <FileSpreadsheet className="w-4 h-4 text-slate-500" />
                            <span className="text-sm font-medium text-slate-700 flex-1 truncate">{file?.name}</span>
                            <span className="text-xs text-slate-400">{previewRows.length} preview rows</span>
                            <button onClick={reset} className="p-1 rounded hover:bg-slate-200 transition-colors cursor-pointer">
                                <X className="w-3.5 h-3.5 text-slate-400" />
                            </button>
                        </div>

                        {/* Mapping table */}
                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-100">
                                        <th className="text-left py-2 px-3 font-medium text-slate-500 text-xs">CSV Column</th>
                                        <th className="w-8"></th>
                                        <th className="text-left py-2 px-3 font-medium text-slate-500 text-xs">Map To</th>
                                        <th className="text-left py-2 px-3 font-medium text-slate-500 text-xs">Sample</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {headers.map((h) => (
                                        <tr key={h} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                                            <td className="py-2 px-3 font-mono text-xs text-slate-700">{h}</td>
                                            <td className="text-center">
                                                <ArrowRight className="w-3.5 h-3.5 text-slate-300 mx-auto" />
                                            </td>
                                            <td className="py-1.5 px-3">
                                                <select
                                                    value={columnMapping[h] || ''}
                                                    onChange={(e) => setColumnMapping(prev => ({ ...prev, [h]: e.target.value }))}
                                                    className="w-full text-xs rounded-md border border-slate-200 bg-white px-2 py-1.5 text-slate-700 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                                                >
                                                    {TARGET_FIELDS.map(f => (
                                                        <option key={f.value} value={f.value}>{f.label}</option>
                                                    ))}
                                                    <option value="__custom">Custom Variable</option>
                                                </select>
                                            </td>
                                            <td className="py-2 px-3 text-xs text-slate-400 truncate max-w-[140px]">
                                                {previewRows[0]?.[h] || '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {!emailMapped && (
                            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                You must map at least one column to <strong>Email</strong> to import.
                            </div>
                        )}

                        {/* List selection */}
                        <div className="space-y-2">
                            <label className="block text-xs font-medium text-slate-500">Import to list</label>
                            <div className="grid grid-cols-2 gap-2">
                                <select
                                    value={selectedListId}
                                    onChange={(e) => { setSelectedListId(e.target.value); if (e.target.value) setListName('') }}
                                    className="text-sm rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-700 outline-none focus:ring-2 focus:ring-primary-500"
                                >
                                    <option value="">New list...</option>
                                    {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                </select>
                                {!selectedListId && (
                                    <Input
                                        placeholder="New list name"
                                        value={listName}
                                        onChange={(e) => setListName(e.target.value)}
                                        className="text-sm"
                                    />
                                )}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="outline" onClick={() => { reset(); onOpenChange(false) }}>Cancel</Button>
                            <Button onClick={handleImport} disabled={!emailMapped || importing}>
                                {importing ? 'Importing...' : <><Check className="w-4 h-4" /> Import Leads</>}
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
