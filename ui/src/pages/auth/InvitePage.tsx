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
        title: 'Аккаунт создан',
        description: 'Добро пожаловать в Auto-Flow.',
      });
      navigate('/projects');
    } catch (error: any) {
      toast({
        title: 'Ошибка приглашения',
        description: error?.message || 'Проверьте данные и попробуйте снова.',
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
          <CardTitle className="text-2xl">Принять приглашение</CardTitle>
          <CardDescription>Создайте аккаунт, чтобы продолжить</CardDescription>
        </CardHeader>
        <CardContent>
          {isValid === false ? (
            <div className="text-center text-sm text-muted-foreground">
              Эта ссылка недействительна или срок ее действия истек.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Имя пользователя</Label>
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
                <Label htmlFor="password">Пароль</Label>
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
                {isLoading ? 'Создание...' : 'Создать аккаунт'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
