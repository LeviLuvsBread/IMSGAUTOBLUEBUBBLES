import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TemplateForm } from "@/components/TemplateForm";
import { SeedTemplatesButton } from "@/components/SeedTemplatesButton";
import { deleteTemplate } from "../actions";
import type { Template } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("templates")
    .select("*")
    .order("name", { ascending: true });
  const templates = (data ?? []) as Template[];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-footnote text-label-secondary tabular-nums">
            {templates.length} total
          </p>
          <h1 className="text-h4 font-display">Templates</h1>
        </div>
        <SeedTemplatesButton />
      </div>

      <div className="max-w-xl">
        <h2 className="mb-3 text-subhead font-semibold">New template</h2>
        <TemplateForm />
      </div>

      <div>
        <h2 className="mb-2 text-footnote font-medium text-label-secondary">
          {templates.length} saved
        </h2>
        {templates.length === 0 ? (
          <p className="text-sm text-neutral-400">No templates yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {templates.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 p-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="font-medium">{t.name}</div>
                  <div className="line-clamp-1 text-neutral-500">{t.body}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    href={`/templates/${t.id}`}
                    className="rounded-lg border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700"
                  >
                    Edit
                  </Link>
                  <form action={deleteTemplate}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className="rounded-lg border border-neutral-300 px-2 py-1 text-xs text-red-600 dark:border-neutral-700">
                      Delete
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
