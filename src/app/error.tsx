'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-4xl font-medium mb-4">Something went wrong!</h1>
      <p className="text-muted-foreground mb-8">{error.message || 'An unexpected error occurred.'}</p>
      <button
        onClick={reset}
        className="bg-primary text-primary-foreground px-6 py-2.5 rounded-md hover:bg-primary/90 transition-colors"
      >
        Try again
      </button>
    </div>
  )
} 