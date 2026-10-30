import { Link } from 'react-router-dom';

export type PartyPerson = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  reference?: string | null;
};

export function partyLabel(
  client?: { firstName?: string | null; lastName?: string | null } | null,
  coClients?: PartyPerson[] | null,
) {
  const names: string[] = [];
  const main = `${client?.firstName || ''} ${client?.lastName || ''}`.trim();
  if (main) names.push(main);
  for (const person of coClients || []) {
    const name = `${person.firstName || ''} ${person.lastName || ''}`.trim();
    if (name && !names.includes(name)) names.push(name);
  }
  return names.join(', ');
}

export function PartyNames({
  client,
  coClients,
  linkClassName = 'hover:text-[#007aff]',
}: {
  client?: PartyPerson | null;
  coClients?: PartyPerson[] | null;
  linkClassName?: string;
}) {
  if (!client?.id) return <>—</>;
  const people = [client, ...(coClients || [])].filter((person, index, all) => (
    person.id && all.findIndex((other) => other.id === person.id) === index
  ));
  return (
    <>
      {people.map((person, index) => (
        <span key={person.id}>
          {index > 0 ? ', ' : ''}
          <Link to={`/clients/${person.id}`} className={linkClassName} onClick={(e) => e.stopPropagation()}>
            {person.firstName} {person.lastName}
          </Link>
        </span>
      ))}
    </>
  );
}
