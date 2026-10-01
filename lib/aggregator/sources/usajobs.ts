import type { JobListing } from '@/types/job';
import { classifyIndustry, htmlToText, fetchJson, finalize, inferEmploymentType, inferWorkType, safeIso, snippet } from '../normalize';
import { regionsFor, toRegionCode } from '../regions';
import { env, type SourceAdapter } from './types';

interface UsaJobsItem {
  MatchedObjectDescriptor: {
    PositionTitle: string;
    OrganizationName?: string;
    DepartmentName?: string;
    PositionURI: string;
    ApplyURI?: string[];
    PublicationStartDate?: string;
    QualificationSummary?: string;
    PositionLocation?: { CityName?: string; CountrySubDivisionCode?: string; LocationName?: string }[];
    PositionRemuneration?: { MinimumRange?: string; MaximumRange?: string; RateIntervalCode?: string }[];
    PositionSchedule?: { Name?: string }[];
    JobCategory?: { Name?: string }[];
    UserArea?: { Details?: { JobSummary?: string; RemoteIndicator?: boolean } };
  };
}

export const usajobs: SourceAdapter = {
  name: 'USAJobs',
  source: 'usajobs',
  skipReason: () => (env('USAJOBS_API_KEY') && env('USAJOBS_USER_AGENT') ? null : 'Needs a free key: add secrets USAJOBS_API_KEY + USAJOBS_USER_AGENT (your email) — developer.usajobs.gov'),
  async fetch(p) {
    if (p.country === 'CA') return [];
    const qs = new URLSearchParams({ ResultsPerPage: '50', Fields: 'Full' });
    if (p.q) qs.set('Keyword', p.q);
    const loc = [p.city, p.region && regionsFor('US')[p.region]].filter(Boolean).join(', ');
    if (loc) qs.set('LocationName', loc);
    if (p.postedWithinDays) qs.set('DatePosted', String(Math.min(p.postedWithinDays, 60)));
    if (p.minSalary) qs.set('RemunerationMinimumAmount', String(p.minSalary));
    if (p.workType === 'remote') qs.set('RemoteIndicator', 'True');
    if (p.employmentType === 'part-time') qs.set('PositionScheduleTypeCode', '2');
    if (p.employmentType === 'full-time') qs.set('PositionScheduleTypeCode', '1');

    const data = await fetchJson<{ SearchResult?: { SearchResultItems?: UsaJobsItem[] } }>(
      `https://data.usajobs.gov/api/search?${qs}`,
      { headers: { 'User-Agent': env('USAJOBS_USER_AGENT'), 'Authorization-Key': env('USAJOBS_API_KEY') } },
    );
    return (data.SearchResult?.SearchResultItems ?? []).map(({ MatchedObjectDescriptor: d }): JobListing => {
      const l = d.PositionLocation?.[0];
      const pay = d.PositionRemuneration?.[0];
      const hourly = /hour/i.test(pay?.RateIntervalCode ?? '');
      const remote = !!d.UserArea?.Details?.RemoteIndicator;
      const sched = d.PositionSchedule?.[0]?.Name ?? '';
      const region = toRegionCode(l?.CountrySubDivisionCode, 'US');
      return finalize({
        title: d.PositionTitle,
        company: d.OrganizationName || d.DepartmentName || 'US Federal Government',
        location: { city: l?.CityName ?? (l?.LocationName ?? '').split(',')[0] ?? '', stateProvince: region, country: 'US', isRemote: remote },
        workType: inferWorkType(d.PositionTitle, remote),
        employmentType: inferEmploymentType(sched + ' ' + d.PositionTitle),
        industry: classifyIndustry(d.PositionTitle, d.JobCategory?.[0]?.Name),
        salary: pay?.MinimumRange || pay?.MaximumRange
          ? { min: Number(pay.MinimumRange) || undefined, max: Number(pay.MaximumRange) || undefined, currency: 'USD', period: hourly ? 'hourly' : 'yearly' }
          : undefined,
        descriptionSnippet: snippet(d.UserArea?.Details?.JobSummary || d.QualificationSummary),
        description: [d.UserArea?.Details?.JobSummary, d.QualificationSummary && `Qualifications\n${d.QualificationSummary}`].filter(Boolean).map((x) => htmlToText(x)).join('\n\n'),
        applyUrl: d.ApplyURI?.[0] || d.PositionURI,
        source: 'usajobs',
        postedAt: safeIso(d.PublicationStartDate),
      });
    });
  },
};
