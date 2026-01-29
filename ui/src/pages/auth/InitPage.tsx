import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';

export function InitPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await apiFetch('/init', {
        method: 'POST',
        body: { token, username, password },
      });
      toast({
        title: 'Администратор создан',
        description: 'Вы вошли в систему.',
      });
      navigate('/projects');
    } catch (error: any) {
      toast({
        title: 'Ошибка инициализации',
        description: error?.message || 'Проверьте токен и попробуйте снова.',
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
          <CardTitle className="text-2xl">Инициализация администратора</CardTitle>
          <CardDescription>Одноразовая настройка первого администратора</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="token">Токен инициализации</Label>
              <Input
                id="token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Вставьте INIT_ADMIN_TOKEN"
                className="border-2"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">Имя пользователя</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="border-2"
                required
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
              />
            </div>
            <Button type="submit" className="w-full shadow-sm" disabled={isLoading}>
              {isLoading ? 'Создание...' : 'Создать администратора'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
