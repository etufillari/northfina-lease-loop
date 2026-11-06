/** Dark enough for white initials. These identify people, so they are not action colours. */
const colors = ['#0066cc', '#b4451f', '#0f7a55', '#6250d6'];

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return `${words[0]?.[0] ?? '?'}${words.length > 1 ? words.at(-1)![0] : ''}`.toUpperCase();
}

/** The person's name always appears beside this or in its title, so it adds no extra label. */
export function PersonAvatar({
  id,
  name,
  size = 'large',
}: {
  id: string;
  name: string;
  size?: 'large' | 'small';
}) {
  const hash = [...id].reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) % 9973, 0);
  return (
    <span
      aria-hidden="true"
      title={name}
      style={{ backgroundColor: colors[hash % colors.length] }}
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${size === 'large' ? 'size-12 text-body' : 'size-8 text-fine ring-2 ring-canvas'}`}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ people }: { people: readonly { id: string; name: string }[] }) {
  return (
    <div className="flex -space-x-1">
      {people.map((person) => (
        <PersonAvatar key={person.id} id={person.id} name={person.name} size="small" />
      ))}
    </div>
  );
}
