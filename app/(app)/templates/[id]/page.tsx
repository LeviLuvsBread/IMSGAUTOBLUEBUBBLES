import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TemplateForm } from "@/components/TemplateForm";
import type { Template } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();

  return (
    <div className="max-w-xl space-y-4">
      <Link href="/templates" className="text-sm text-imsg-blue hover:underline">
        ← Templates
      </Link>
      <h1 className="text-lg font-semibold">Edit {(data as Template).name}</h1>
      <TemplateForm template={data as Template} />
    </div>
  );
}
