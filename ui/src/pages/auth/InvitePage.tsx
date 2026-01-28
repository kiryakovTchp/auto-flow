import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';

export function InvitePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isValid, setIsValid] = useState<boolean | null>(null);

  useEffect(() => {
    if (!token) {
      setIsValid(false);
      return;
    }
    apiFetch(`/invites/${encodeURIComponent(token)}`)
      .then(() => setIsValid(true))
      .catch(() => setIsValid(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setIsLoading(true);
    try {
      await apiFetch(`/invites/${encodeURIComponent(token)}`, {
        method: 'POST',
        body: { username, password },
      });
      toast({
        title: 'Account created',
        description: 'Welcome to Auto-Flow.',
      });
      navigate('/projects');
    } catch (error: any) {
      toast({
        title: 'Invite failed',
        description: error?.message || 'Please check your details and try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-2 border-border shadow-md">
        <CardHeader className="text-center">
          <div className="h-12 w-12 bg-primary mx-auto mb-4 flex items-center justify-center">
            <span className="text-primary-foreground font-mono font-bold text-lg">AF</span>
          </div>
          <CardTitle className="text-2xl">Accept Invite</CardTitle>
          <CardDescription>Create your account to continue</CardDescription>
        </CardHeader>
        <CardContent>
          {isValid === false ? (
            <div className="text-center text-sm text-muted-foreground">
              This invite link is invalid or expired.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="john_doe"
                  className="border-2"
                  required
                  disabled={isValid === null}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="border-2"
                  required
                  disabled={isValid === null}
                />
              </div>
              <Button type="submit" className="w-full shadow-sm" disabled={isLoading || isValid === null}>
                {isLoading ? 'Creating...' : 'Create Account'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
