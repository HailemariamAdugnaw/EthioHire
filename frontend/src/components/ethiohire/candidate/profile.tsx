
/** EthioHire — Candidate profile & structured CV builder with document verification
 *  inputs and automated reference-check intake. */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { apiJson } from "@/lib/auth-client";
import { DEGREE_LEVELS } from "@/lib/constants";
import { BadgeCheck, FileText, Loader2, Plus, Trash2, UserRound } from "lucide-react";

interface Doc { id: string; type: string; name: string; verified: boolean }
interface Ref { id: string; name: string; title: string | null; company: string | null; email: string | null; surveyStatus: string }
interface Profile {
  fullName: string; phone: string | null; universityName: string | null; degreeLevel: string | null;
  fieldOfStudy: string | null; graduationYear: number | null; gpa: number | null; expectedSalary: number | null;
  experienceYears: number | null; skills: string | null; about: string | null;
  documents: Doc[]; references: Ref[];
}

export function CandidateProfile() {
  const [p, setP] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  // new reference form
  const [refName, setRefName] = useState("");
  const [refTitle, setRefTitle] = useState("");
  const [refCompany, setRefCompany] = useState("");
  const [refEmail, setRefEmail] = useState("");

  useEffect(() => {
    apiJson<{ profile: Profile }>("/api/candidate/profile")
      .then((d) => setP(d.profile))
      .catch(() => {});
  }, []);

  if (!p) return <div className="py-20 text-center text-sm text-muted-foreground">Loading profile…</div>;

  const set = (k: keyof Profile, v: unknown) => {
    setP((prev) => (prev ? { ...prev, [k]: v } : prev));
    setSaved(false);
  };

  const save = async () => {
    setBusy(true);
    try {
      const data = await apiJson<{ profile: Profile }>("/api/candidate/profile", { method: "PUT", body: JSON.stringify(p) });
      setP(data.profile);
      setSaved(true);
      toast({ title: "Profile saved", description: "Your structured CV is up to date for pre-screening." });
    } catch (err) {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const uploadDoc = async (file: File, type: string) => {
    if (file.size > 2_500_000) {
      toast({ title: "File too large", description: "Please upload files under 2.5 MB in this demo.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await apiJson("/api/candidate/documents", {
          method: "POST",
          body: JSON.stringify({ type, name: file.name, fileUrl: reader.result }),
        });
        const d = await apiJson<{ profile: Profile }>("/api/candidate/profile");
        setP(d.profile);
        toast({ title: "Document uploaded", description: `${file.name} attached to your profile.` });
      } catch (err) {
        toast({ title: "Upload failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
      }
    };
    reader.readAsDataURL(file);
  };

  const deleteDoc = async (id: string) => {
    try {
      await apiJson(`/api/candidate/documents?id=${id}`, { method: "DELETE" });
      setP((prev) => (prev ? { ...prev, documents: prev.documents.filter((d) => d.id !== id) } : prev));
    } catch (err) {
      toast({ title: "Delete failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  };

  const addReference = async () => {
    if (!refName.trim()) return;
    try {
      await apiJson("/api/candidate/references", {
        method: "POST",
        body: JSON.stringify({ name: refName, title: refTitle, company: refCompany, email: refEmail }),
      });
      const d = await apiJson<{ profile: Profile }>("/api/candidate/profile");
      setP(d.profile);
      setRefName(""); setRefTitle(""); setRefCompany(""); setRefEmail("");
      toast({ title: "Reference added", description: "An automated reference survey has been dispatched by email." });
    } catch (err) {
      toast({ title: "Could not add reference", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Profile & structured CV</h1>
          <p className="text-sm text-muted-foreground">This data feeds the Stage-1 pre-screening engine — accuracy matters.</p>
        </div>
        <Button onClick={save} disabled={busy}>
          {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          {saved ? "Saved ✓" : "Save profile"}
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ---------------- Identity & education ---------------- */}
        <Card>
          <CardContent className="p-5">
            <h2 className="mb-4 flex items-center gap-2 font-bold"><UserRound className="h-4.5 w-4.5 h-[18px] w-[18px] text-primary" /> Identity & education</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="f-name">Full name</Label>
                <Input id="f-name" value={p.fullName} onChange={(e) => set("fullName", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="f-phone">Phone</Label>
                <Input id="f-phone" placeholder="+251 91 …" value={p.phone || ""} onChange={(e) => set("phone", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="f-uni">University / College</Label>
                <Input id="f-uni" placeholder="Addis Ababa University" value={p.universityName || ""} onChange={(e) => set("universityName", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="f-field">Field of study</Label>
                <Input id="f-field" placeholder="Computer Science" value={p.fieldOfStudy || ""} onChange={(e) => set("fieldOfStudy", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Degree level</Label>
                <Select value={p.degreeLevel || ""} onValueChange={(v) => set("degreeLevel", v)}>
                  <SelectTrigger aria-label="Degree level"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {DEGREE_LEVELS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="f-year">Grad. year</Label>
                  <Input id="f-year" type="number" min="1990" max="2035" placeholder="2024" value={p.graduationYear ?? ""} onChange={(e) => set("graduationYear", e.target.value ? parseInt(e.target.value) : null)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="f-gpa">GPA</Label>
                  <Input id="f-gpa" type="number" step="0.01" min="0" max="4" placeholder="3.50" value={p.gpa ?? ""} onChange={(e) => set("gpa", e.target.value ? parseFloat(e.target.value) : null)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="f-exp">Experience (years)</Label>
                <Input id="f-exp" type="number" min="0" max="40" placeholder="2" value={p.experienceYears ?? ""} onChange={(e) => set("experienceYears", e.target.value ? parseInt(e.target.value) : null)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="f-salary">Expected salary (ETB / month)</Label>
                <Input id="f-salary" type="number" min="0" placeholder="35000" value={p.expectedSalary ?? ""} onChange={(e) => set("expectedSalary", e.target.value ? parseFloat(e.target.value) : null)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="f-skills">Skills (comma separated)</Label>
                <Input id="f-skills" placeholder="React, TypeScript, Node.js, SQL" value={p.skills || ""} onChange={(e) => set("skills", e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="f-about">About</Label>
                <Textarea id="f-about" rows={3} placeholder="Short professional summary…" value={p.about || ""} onChange={(e) => set("about", e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-5">
          {/* ---------------- Documents ---------------- */}
          <Card>
            <CardContent className="p-5">
              <h2 className="mb-1 flex items-center gap-2 font-bold"><FileText className="h-[18px] w-[18px] text-primary" /> Verified credentials</h2>
              <p className="mb-4 text-xs text-muted-foreground">Upload degrees, transcripts and professional certificates (PDF/image).</p>
              <div className="space-y-2">
                {p.documents.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">No documents uploaded yet.</p>
                ) : (
                  p.documents.map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg border p-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{d.name}</p>
                          <p className="text-[11px] text-muted-foreground">{d.type.replace("_", " ")}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {d.verified ? <BadgeCheck className="h-4 w-4 text-primary" /> : null}
                        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Delete ${d.name}`} onClick={() => deleteDoc(d.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <Separator className="my-4" />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {["DEGREE", "TRANSCRIPT", "CERTIFICATE"].map((t) => (
                  <div key={t}>
                    <Label htmlFor={`file-${t}`} className="mb-1.5 block text-center text-xs">{t}</Label>
                    <label
                      htmlFor={`file-${t}`}
                      className="flex h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                      <Plus className="h-4 w-4" />
                      Upload
                    </label>
                    <input
                      id={`file-${t}`}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadDoc(f, t);
                        e.target.value = "";
                      }}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* ---------------- References ---------------- */}
          <Card>
            <CardContent className="p-5">
              <h2 className="mb-1 font-bold">Reference checks</h2>
              <p className="mb-4 text-xs text-muted-foreground">Add previous managers or instructors — EthioHire dispatches structured surveys automatically.</p>
              <div className="space-y-2">
                {p.references.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border p-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.name}{r.title ? ` — ${r.title}` : ""}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{r.company || r.email}</p>
                    </div>
                    <Badge variant="outline" className={r.surveyStatus === "COMPLETED" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : r.surveyStatus === "SENT" ? "border-amber-200 bg-amber-50 text-amber-700" : ""}>
                      {r.surveyStatus}
                    </Badge>
                  </div>
                ))}
              </div>
              <Separator className="my-4" />
              <div className="grid gap-2 sm:grid-cols-2">
                <Input placeholder="Reference name *" value={refName} onChange={(e) => setRefName(e.target.value)} aria-label="Reference name" />
                <Input placeholder="Job title" value={refTitle} onChange={(e) => setRefTitle(e.target.value)} aria-label="Reference title" />
                <Input placeholder="Company" value={refCompany} onChange={(e) => setRefCompany(e.target.value)} aria-label="Reference company" />
                <Input placeholder="Email" type="email" value={refEmail} onChange={(e) => setRefEmail(e.target.value)} aria-label="Reference email" />
              </div>
              <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={addReference} disabled={!refName.trim()}>
                <Plus className="mr-1 h-4 w-4" /> Add reference & send survey
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
