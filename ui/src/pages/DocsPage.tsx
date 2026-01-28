import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function DocsPage() {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const links = [
    { label: '/health', href: `${base}/health` },
    { label: '/metrics', href: `${base}/metrics` },
    { label: '/api/v1/openapi.json', href: `${base}/api/v1/openapi.json` },
    { label: '/projects', href: `${base}/projects` },
  ];

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card className="border-2 border-border">
          <CardHeader>
            <CardTitle>Auto-Flow Docs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">Quick links</div>
            <div className="flex flex-wrap gap-2">
              {links.map((l) => (
                <Button key={l.label} variant="outline" className="border-2" asChild>
                  <a href={l.href}>{l.label}</a>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
