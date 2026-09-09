interface ErrorStateProps {
  message: string
  onRetry: () => void
  actionLabel?: string
  onAction?: () => void
}

export function ErrorState({ message, onRetry, actionLabel, onAction }: ErrorStateProps) {
  return (
    <div className="error-message" role="alert">
      <span aria-hidden="true">!</span>
      <div className="error-content">
        <strong>Review could not be completed</strong>
        <p>{message}</p>
        <button type="button" onClick={onRetry}>Try Again</button>
        {actionLabel && onAction && <button className="error-secondary-action" type="button" onClick={onAction}>{actionLabel}</button>}
      </div>
    </div>
  )
}
