
/** EthioHire — Company profile management (recruiter) */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Building2, ShieldCheck } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiJson } from "@/lib/auth-client";

interface Company {
  companyName: string;
  industry: string | null;
  website: string | null;
  location: string | null;
  description: string | null;
  verificationStatus: string;
  subscriptionPlan: string;
}

export function RecruiterCompany() {
  const [c, setC] = useState<Company | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiJson<{ company: Company }>("/api/recruiter/company").then((d) => setC(d.company)).catch(() => {});
  }, []);

  if (!c) return <div className="py-20 text-center text-sm text-muted-foreground">Loading company profile…</div>;

  const set = (k: keyof Company, v: string) => {
    setC((prev) => (prev ? { ...prev, [k]: v } : prev));
  };

  const save = async () => {
    setBusy(true);
    try {
      await apiJson("/api/recruiter/company", { method: "PUT", body: JSON.stringify(c) });
      toast({ title: "Company profile saved" });
    } catch (err) {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Building2 className="h-6 w-6 text-primary" /> Company profile</h1>
          <p className="text-sm text-muted-foreground">Shown to candidates on the job board. Verification is handled by the platform admin.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={c.verificationStatus === "APPROVED" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : c.verificationStatus === "SUSPENDED" ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-700"}
          >
            <ShieldCheck className="mr-1 h-3 w-3" /> {c.verificationStatus}
          </Badge>
          <Badge variant="secondary">{c.subscriptionPlan} plan</Badge>
        </div>
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="c-name">Company name</Label>
              <Input id="c-name" value={c.companyName} onChange={(e) => set("companyName", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-industry">Industry</Label>
              <Input id="c-industry" placeholder="Software & IT Services" value={c.industry || ""} onChange={(e) => set("industry", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-web">Website</Label>
              <Input id="c-web" placeholder="https://…" value={c.website || ""} onChange={(e) => set("website", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-loc">Location</Label>
              <Input id="c-loc" placeholder="Addis Ababa, Ethiopia" value={c.location || ""} onChange={(e) => set("location", e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="c-desc">About the company</Label>
              <Textarea id="c-desc" rows={4} placeholder="What you build, your team culture, benefits…" value={c.description || ""} onChange={(e) => set("description", e.target.value)} />
            </div>
          </div>
          <Button className="mt-4" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Save changes
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
