import { useState, useRef } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { Upload04Icon, FileImportIcon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { parseSdStudioFile, type ParsedScenePack } from '@/lib/sd-studio-import'
import { importScenePack } from '@/server/functions/import'

interface ImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: (packId: number) => void
}

export function ImportDialog({ open, onOpenChange, onImported }: ImportDialogProps) {
  const [parsed, setParsed] = useState<ParsedScenePack | null>(null)
  const [packName, setPackName] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function reset() {
    setParsed(null)
    setPackName('')
    setError(null)
    setImporting(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)

    try {
      const text = await file.text()
      const json = JSON.parse(text)
      const result = parseSdStudioFile(json)
      setParsed(result)
      setPackName(result.name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file')
      setParsed(null)
    }
  }

  async function handleImport() {
    if (!parsed || !packName.trim()) return
    setImporting(true)
    try {
      const pack = await importScenePack({
        data: {
          name: packName.trim(),
          scenes: parsed.scenes.map((s) => ({
            name: s.name,
            placeholders: JSON.stringify(s.placeholders),
            sortOrder: s.sortOrder,
          })),
        },
      })
      toast.success(`Imported ${parsed.scenes.length} scenes`)
      handleOpenChange(false)
      onImported(pack.id)
    } catch {
      toast.error('Failed to import')
      setImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={FileImportIcon} className="size-5" />
            Import SD Studio Preset
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
          {/* File input */}
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              onChange={handleFile}
              className="hidden"
            />
            <Button
              variant="outline"
              className="w-full justify-center gap-2"
              onClick={() => fileRef.current?.click()}
            >
              <HugeiconsIcon icon={Upload04Icon} className="size-5" />
              {parsed ? 'Choose different file' : 'Select JSON file'}
            </Button>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Preview */}
          {parsed && (
            <div className="space-y-4">
              {/* Pack name */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Pack Name
                </label>
                <Input
                  value={packName}
                  onChange={(e) => setPackName(e.target.value)}
                  className="rounded-lg"
                />
              </div>

              {/* Summary badges */}
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{parsed.scenes.length} scenes</Badge>
                {parsed.libraryPieces.length > 0 && (
                  <Badge variant="outline">
                    {parsed.libraryPieces.length} library pieces: {parsed.libraryPieces.join(', ')}
                  </Badge>
                )}
              </div>

              {/* Scene list preview */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Scenes Preview
                </label>
                <div className="rounded-lg border border-border max-h-60 overflow-y-auto divide-y divide-border/50">
                  {parsed.scenes.map((scene, i) => {
                    const template = scene.placeholders._template || ''
                    const pieceKeys = Object.keys(scene.placeholders).filter((k) => k !== '_template')
                    return (
                      <div key={i} className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{scene.name}</span>
                          {pieceKeys.length > 0 && (
                            <span className="text-xs text-muted-foreground shrink-0">
                              {pieceKeys.length} pieces
                            </span>
                          )}
                        </div>
                        {template && (
                          <p className="text-xs text-muted-foreground font-mono mt-0.5 line-clamp-2">
                            {template}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {parsed && (
          <DialogFooter>
            <Button variant="ghost" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={importing || !packName.trim()}>
              {importing ? 'Importing...' : `Import ${parsed.scenes.length} scenes`}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
