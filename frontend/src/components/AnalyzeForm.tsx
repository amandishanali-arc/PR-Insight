import { type FormEvent, type RefObject, useState } from 'react'

interface AnalyzeFormProps {
  isLoading: boolean
  inputRef: RefObject<HTMLInputElement | null>
  pullRequestUrl: string
  onUrlChange: (value: string) => void
  onSubmit: (pullRequestUrl: string) => Promise<void>
}

const GITHUB_PR_PATTERN =
  /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+\/?$/i

const EXAMPLE_PR_URL = 'https://github.com/react/create-react-app/pull/13712'

export function AnalyzeForm({
  isLoading,
  inputRef,
  pullRequestUrl,
  onUrlChange,
  onSubmit,
}: AnalyzeFormProps) {
  const [validationError, setValidationError] = useState<string | null>(null)
  const normalizedUrl = pullRequestUrl.trim()
  const isValid = GITHUB_PR_PATTERN.test(normalizedUrl)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!GITHUB_PR_PATTERN.test(normalizedUrl)) {
      setValidationError('Enter a valid GitHub pull request URL.')
      return
    }

    setValidationError(null)
    void onSubmit(normalizedUrl)
  }

  return (
    <form className="analyze-form" onSubmit={handleSubmit} noValidate>
      <label htmlFor="pull-request-url">GitHub Pull Request URL</label>
      <div className="input-row">
        <div className="url-input-wrap">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.86c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.35 1.09 2.92.83.09-.65.35-1.09.64-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.6 9.6 0 0 1 12 6.83a9.5 9.5 0 0 1 2.5.34c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.86v2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
          </svg>
          <input
            ref={inputRef}
            id="pull-request-url"
            type="url"
            value={pullRequestUrl}
            onChange={(event) => {
              onUrlChange(event.target.value)
              if (validationError) setValidationError(null)
            }}
            onBlur={() => {
              if (normalizedUrl && !isValid) {
                setValidationError('Enter a valid GitHub pull request URL.')
              }
            }}
            placeholder="https://github.com/owner/repository/pull/123"
            aria-describedby={validationError ? 'url-error' : 'url-hint'}
            aria-invalid={Boolean(validationError)}
            disabled={isLoading}
            autoComplete="url"
          />
        </div>
        <button type="submit" disabled={isLoading || !isValid}>
          {isLoading ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Analyzing...
            </>
          ) : (
            <>
              <span className="button-play" aria-hidden="true" />
              Analyze Pull Request
            </>
          )}
        </button>
      </div>
      {validationError ? (
        <p className="field-error" id="url-error">{validationError}</p>
      ) : isValid ? (
        <p className="field-valid" id="url-hint"><span aria-hidden="true">✓</span> Valid GitHub pull request URL</p>
      ) : (
        <p className="field-hint" id="url-hint">
          <span>Public pull requests are supported.</span>
          <button
            className="example-button"
            type="button"
            onClick={() => onUrlChange(EXAMPLE_PR_URL)}
            disabled={isLoading}
          >
            Try example: react/create-react-app #13712
          </button>
        </p>
      )}
    </form>
  )
}
