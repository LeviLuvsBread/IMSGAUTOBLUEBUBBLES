import { saveTemplate } from "@/app/(app)/actions";
import type { Template } from "@/lib/types";

export function TemplateForm({ template }: { template?: Template }) {
  return (
    <form action={saveTemplate} className="space-y-3">
      {template ? <input type="hidden" name="id" value={template.id} /> : null}
      <div>
        <label className="mb-1 block text-sm font-medium">Name</label>
        <input
          name="name"
          required
          defaultValue={template?.name ?? ""}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">
          Body{" "}
          <span className="text-xs font-normal text-neutral-400">
            (variables: {"{{name}}"}, {"{{first_name}}"}, {"{{company}}"},{" "}
            {"{{email}}"}, {"{{phone}}"})
          </span>
        </label>
        <textarea
          name="body"
          required
          rows={6}
          defaultValue={template?.body ?? ""}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        />
      </div>
      <button className="rounded-lg bg-imsg-blue px-4 py-2 text-sm font-medium text-white">
        {template ? "Save changes" : "Create template"}
      </button>
    </form>
  );
}
