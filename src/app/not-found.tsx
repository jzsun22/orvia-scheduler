import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-4xl font-medium mb-4">404 - Page Not Found</h1>
      <p className="text-muted-foreground mb-8">The page you are looking for does not exist.</p>
      <Link href="/dashboard" className="bg-primary text-primary-foreground px-6 py-2.5 rounded-md hover:bg-primary/90 transition-colors">
        Go Home
      </Link>
    </div>
  )
} 