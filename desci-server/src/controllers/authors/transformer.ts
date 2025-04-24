import { AffiliationGroup2 } from '../../services/crossRef/types/summary.js';

interface AuthorExperience {
  title: string;
  startDate: string;
  endDate?: string;
  organisation: {
    name: string;
    department: string;
    location: string;
  };
}

export function transformOrcidAffiliationToEmployment(affiliations: AffiliationGroup2[]): AuthorExperience[] {
  return affiliations.map((affiliation) => {
    const entry = affiliation['summaries'][0]['employment-summary'];
    const start = entry['start-date'];
    const end = entry['end-date'];
    const location = `${entry.organization.address?.city} ${entry.organization.address?.region} ${entry.organization.address.country}`;
    return {
      title: entry['role-title'],
      startDate: `${start.year?.value}/${start.month?.value ?? '01'}/${start.day?.value ?? '01'}`,
      endDate: end ? `${end.year?.value}/${end.month?.value ?? '01'}/${end.day?.value ?? '01'}` : null,
      organisation: {
        location,
        name: entry.organization.name,
        department: entry['department-name'],
      },
    };
  });
}
export function transformOrcidAffiliationToEducation(affiliations: AffiliationGroup2[]): AuthorExperience[] {
  return affiliations.map((affiliation) => {
    const entry = affiliation['summaries'][0]['education-summary'];
    const start = entry['start-date'];
    const end = entry['end-date'];
    const location = `${entry.organization.address?.city} ${entry.organization.address?.region} ${entry.organization.address.country}`;
    return {
      title: entry['role-title'],
      startDate: `${start.year?.value}/${start.month?.value ?? '01'}/${start.day?.value ?? '01'}`,
      endDate: end ? `${end.year?.value}/${end.month?.value ?? '01'}/${end.day?.value ?? '01'}` : null,
      organisation: {
        location,
        name: entry.organization.name,
        department: entry['department-name'],
      },
    };
  });
}
