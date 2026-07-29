"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@restai/validators";
import { Button } from "@restai/ui/components/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@restai/ui/components/card";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";
import Link from "next/link";
import { buildPlatformAppOrigin, isPlatformControlHost } from "@restai/config";

export default function LoginPage() {
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isControlPlane, setIsControlPlane] = useState(false);

  useEffect(() => {
    setIsControlPlane(isPlatformControlHost(window.location.hostname));
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginInput) => {
    try {
      setError(null);
      setLoading(true);
      await login(data.email, data.password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao entrar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
          <span className="text-2xl font-bold text-primary-foreground">
            {isControlPlane ? "A" : "R"}
          </span>
        </div>
        <CardTitle className="text-2xl">
          {isControlPlane ? "Automatizappy" : "RestAI"}
        </CardTitle>
        <CardDescription>
          {isControlPlane
            ? "Painel da plataforma — acesso exclusivo do super admin"
            : "Entre na sua conta"}
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="tu@email.com"
              {...register("email")}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              placeholder="********"
              {...register("password")}
            />
            {errors.password && (
              <p className="text-sm text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>
          {!isControlPlane && (
            <p className="text-sm text-muted-foreground">
              Não tem conta?{" "}
              <Link href="/register" className="text-primary hover:underline">
                Cadastre-se
              </Link>
            </p>
          )}
          {!isControlPlane && (
            <p className="text-xs text-muted-foreground text-center">
              Dono da plataforma?{" "}
              <a
                href={`${buildPlatformAppOrigin()}/login`}
                className="text-primary hover:underline"
              >
                app.automatizappy.com
              </a>
            </p>
          )}
        </CardFooter>
      </form>
    </Card>
  );
}
