
/** EthioHire — sign in / register view (Firebase mode + demo-mode fallback) */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { EhLogo } from "@/components/ethiohire/bits";
import { navigate } from "@/components/ethiohire/hash-router";
import { useAuth } from "@/lib/auth-client";
import type { Role } from "@/lib/auth-client";
import { KeyRound, Loader2, ShieldCheck, GraduationCap, Briefcase } from "lucide-react";

export function AuthView({ initialMode }: { initialMode: "login" | "register" }) {
  const { user, mode, login, register, loginGoogle, logout } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<string>("CANDIDATE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) {
    return (
      <Centered>
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <EhLogo size={44} />
            <p className="text-sm text-muted-foreground">
              You are signed in as <span className="font-semibold text-foreground">{user.email}</span> ({user.role.toLowerCase()}).
            </p>
            <Button
              className="w-full"
              onClick={() => navigate(user.role === "ADMIN" ? "/admin" : `/${user.role.toLowerCase()}`)}
            >
              Go to my portal
            </Button>
            <Button variant="outline" className="w-full" onClick={async () => { await logout(); navigate("/"); }}>
              Sign out
            </Button>
          </CardContent>
        </Card>
      </Centered>
    );
  }

  const doLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const u = await login(email.trim(), password);
      toast({ title: `Welcome back, ${u.name}!` });
      navigate(u.role === "ADMIN" ? "/admin" : `/${u.role.toLowerCase()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  const doRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const u = await register(email.trim(), password, name.trim(), role as Role);
      toast({ title: `Account created — welcome, ${u.name}!` });
      navigate(`/${u.role.toLowerCase()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  const doGoogle = async () => {
    setError(null);
    setBusy(true);
    try {
      const u = await loginGoogle();
      toast({ title: `Welcome, ${u.name}!` });
      navigate(u.role === "ADMIN" ? "/admin" : `/${u.role.toLowerCase()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  const quickFill = (e: string, p: string) => {
    setEmail(e);
    setPassword(p);
  };

  return (
    <Centered>
      <div className="w-full max-w-md">
        <button onClick={() => navigate("/")} className="mb-6 flex w-full justify-center" aria-label="Back to home">
          <EhLogo size={40} />
        </button>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xl">Sign in to EthioHire</CardTitle>
            <CardDescription>
              One account for the candidate, recruiter and admin portals.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={initialMode}>
              <TabsList className="mb-4 grid w-full grid-cols-2">
                <TabsTrigger value="login">Sign in</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
              </TabsList>

              {/* ------------------------------ LOGIN ------------------------------ */}
              <TabsContent value="login">
                <form onSubmit={doLogin} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" autoComplete="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" type="password" autoComplete="current-password" required placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <KeyRound className="mr-1 h-4 w-4" />}
                    Sign in
                  </Button>
                </form>

                {mode === "FIREBASE" ? (
                  <Button variant="outline" className="mt-3 w-full" onClick={doGoogle} disabled={busy}>
                    <GoogleG /> Continue with Google
                  </Button>
                ) : null}

                {mode === "DEMO" ? (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Demo accounts (one-click fill):</p>
                    <div className="grid grid-cols-3 gap-2">
                      <Button type="button" variant="secondary" size="sm" className="h-auto flex-col gap-0.5 py-2" onClick={() => quickFill("candidate@ethiohire.et", "Demo123!")}>
                        <GraduationCap className="h-4 w-4" />
                        <span className="text-[11px]">Candidate</span>
                      </Button>
                      <Button type="button" variant="secondary" size="sm" className="h-auto flex-col gap-0.5 py-2" onClick={() => quickFill("hr@addistech.et", "Demo123!")}>
                        <Briefcase className="h-4 w-4" />
                        <span className="text-[11px]">Recruiter</span>
                      </Button>
                      <Button type="button" variant="secondary" size="sm" className="h-auto flex-col gap-0.5 py-2" onClick={() => quickFill("admin@ethiohire.et", "Admin123!")}>
                        <ShieldCheck className="h-4 w-4" />
                        <span className="text-[11px]">Admin</span>
                      </Button>
                    </div>
                  </div>
                ) : null}
              </TabsContent>

              {/* ---------------------------- REGISTER ---------------------------- */}
              <TabsContent value="register">
                <form onSubmit={doRegister} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-name">Full name</Label>
                    <Input id="reg-name" required placeholder="Meron Tadesse" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-email">Email</Label>
                    <Input id="reg-email" type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-password">Password</Label>
                    <Input id="reg-password" type="password" required minLength={8} placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>I am a…</Label>
                    <Select value={role} onValueChange={setRole}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose your role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CANDIDATE">Candidate — find jobs & take assessments</SelectItem>
                        <SelectItem value="RECRUITER">Recruiter / HR — post jobs & screen applicants</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                    Create account
                  </Button>
                </form>

                {mode === "FIREBASE" ? (
                  <Button variant="outline" className="mt-3 w-full" onClick={doGoogle} disabled={busy}>
                    <GoogleG /> Sign up with Google
                  </Button>
                ) : null}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,oklch(0.96_0.025_150),transparent_60%)] px-4 py-10">
      {children}
    </div>
  );
}

function GoogleG() {
  return (
    <svg viewBox="0 0 24 24" className="mr-1 h-4 w-4" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
  );
}
