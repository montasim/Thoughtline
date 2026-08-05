import { isProfileComplete, isProviderReady, type AppData } from '../domain/schemas';

export interface SetupAccess {
  linkedIn: boolean;
  providers: boolean;
}

export interface SetupStep {
  label: string;
  detail: string;
  ready: boolean;
}

export function getSetupSteps(app: AppData, access: SetupAccess): SetupStep[] {
  const permissionNeeds = [
    ...(!app.settings.consent.accepted ? ['Accept AI processing consent'] : []),
    ...(!access.linkedIn ? ['Allow LinkedIn page access'] : []),
  ];
  const serviceNeeds = [
    ...(!access.providers ? ['Allow Gemini and Groq connections'] : []),
    ...(app.settings.providerValidation.gemini.state !== 'valid'
      ? ['Validate the Gemini API key']
      : []),
    ...(app.settings.providerValidation.groq.state !== 'valid'
      ? ['Validate the Groq API key']
      : []),
  ];
  const profileNeeds = [
    ...(!app.profile.role ? ['Add your role'] : []),
    ...(app.profile.topics.length === 0 ? ['Add topics you know'] : []),
    ...(!app.profile.audience ? ['Add the people you want to reach'] : []),
  ];
  const prerequisitesReady =
    permissionNeeds.length === 0 &&
    serviceNeeds.length === 0 &&
    isProfileComplete(app.profile) &&
    isProviderReady(app.settings);

  return [
    {
      label: 'Permission',
      detail:
        permissionNeeds.length === 0
          ? 'AI processing and LinkedIn access are allowed.'
          : permissionNeeds.join(' · '),
      ready: permissionNeeds.length === 0,
    },
    {
      label: 'AI services',
      detail:
        serviceNeeds.length === 0 ? 'Gemini and Groq are connected.' : serviceNeeds.join(' · '),
      ready: serviceNeeds.length === 0,
    },
    {
      label: 'Writing profile',
      detail:
        profileNeeds.length === 0
          ? 'Your role, topics, and audience are ready.'
          : profileNeeds.join(' · '),
      ready: profileNeeds.length === 0,
    },
    {
      label: 'Ready',
      detail: app.settings.onboardingComplete
        ? 'Setup is complete.'
        : prerequisitesReady
          ? 'Open setup and complete the Ready step.'
          : 'Available after the items above are complete.',
      ready: app.settings.onboardingComplete,
    },
  ];
}
