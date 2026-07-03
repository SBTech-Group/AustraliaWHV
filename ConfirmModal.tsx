import { AlertTriangle } from 'lucide-react'

interface ConfirmModalProps {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-lg">
        {destructive && (
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--sb-danger-bg)]">
            <AlertTriangle className="h-5 w-5 text-danger" strokeWidth={1.75} />
          </div>
        )}
        <h2 className="sb-h4 text-foreground">{title}</h2>
        <p className="sb-small mt-2 text-muted-foreground">{description}</p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-md border border-border bg-surface-2 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-3"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={
              destructive
                ? 'flex-1 rounded-md bg-danger px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90'
                : 'flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90'
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
