'use client';

interface Props {
  tags: string[];
}

const TAG_COLORS: Record<string, string> = {
  '#PPI부족': 'bg-orange-50 text-orange-600 border-orange-200',
  '#흡연력누락': 'bg-red-50 text-red-600 border-red-200',
  '#신체진찰미흡': 'bg-purple-50 text-purple-600 border-purple-200',
  '#가족력누락': 'bg-yellow-50 text-yellow-600 border-yellow-200',
  '#질문부족': 'bg-rose-50 text-rose-600 border-rose-200',
};

export default function TagSystem({ tags }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <span
          key={tag}
          className={`px-3 py-1 rounded-full text-xs font-semibold border ${
            TAG_COLORS[tag] || 'bg-neutral-100 text-neutral-600 border-neutral-200'
          }`}
        >
          {tag}
        </span>
      ))}
    </div>
  );
}
