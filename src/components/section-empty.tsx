export function SectionEmpty({ title, description }: { title: string; description: string }) {
  return <div className="panel px-5 py-14 text-center"><p className="font-display text-base font-bold">{title}</p><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p></div>
}
