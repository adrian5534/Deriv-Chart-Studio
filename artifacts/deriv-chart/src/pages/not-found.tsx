import { Link } from "wouter";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="text-center p-8 bg-card rounded-2xl border border-border shadow-xl max-w-md w-full">
        <AlertCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
        <h1 className="text-3xl font-bold text-foreground mb-2">404</h1>
        <p className="text-muted-foreground mb-6">The page you are looking for does not exist.</p>
        <Link 
          href="/" 
          className="inline-flex items-center justify-center px-6 py-3 rounded-xl font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Return to Terminal
        </Link>
      </div>
    </div>
  );
}
