// Static seed data for the Horizon onboarding wizard. Kept separate from
// the wizard component so the lists are easy to tune without touching
// step logic.

export const ROLE_TITLE_SEED: string[] = [
  'Solution Architect', 'Cloud Architect', 'Enterprise Architect', 'Software Engineer',
  'Senior Software Engineer', 'Staff Engineer', 'Principal Engineer', 'Engineering Manager',
  'Director of Engineering', 'VP of Engineering', 'CTO', 'CIO', 'CISO', 'CEO', 'Founder',
  'Co-Founder', 'Product Manager', 'Senior Product Manager', 'Director of Product', 'VP of Product',
  'Data Scientist', 'Data Engineer', 'ML Engineer', 'AI Engineer', 'DevOps Engineer', 'SRE',
  'Platform Engineer', 'Cloud Engineer', 'Security Engineer', 'Security Analyst',
  'Network Engineer', 'Systems Administrator', 'Database Administrator', 'QA Engineer',
  'Test Automation Engineer', 'Business Analyst', 'Systems Analyst', 'IT Manager', 'IT Director',
  'Head of IT', 'Practice Head', 'Delivery Manager', 'Program Manager', 'Project Manager',
  'Scrum Master', 'Agile Coach', 'Presales Consultant', 'Presales Engineer', 'Solutions Consultant',
  'Sales Engineer', 'Account Executive', 'Account Manager', 'Business Development Manager',
  'Customer Success Manager', 'Client Partner', 'Consultant', 'Senior Consultant', 'Principal Consultant',
  'Management Consultant', 'Strategy Consultant', 'Technology Consultant', 'ERP Consultant',
  'SAP Consultant', 'Salesforce Consultant', 'DevSecOps Engineer', 'Site Reliability Engineer',
  'Full Stack Developer', 'Backend Developer', 'Frontend Developer', 'Mobile Developer',
  'iOS Developer', 'Android Developer', 'UX Designer', 'UI Designer', 'Product Designer',
  'Design Lead', 'Head of Design', 'Marketing Manager', 'Digital Marketing Manager',
  'Growth Manager', 'Chief Marketing Officer', 'Chief Financial Officer', 'Finance Manager',
  'Financial Analyst', 'Operations Manager', 'Chief Operating Officer', 'HR Manager',
  'Chief Human Resources Officer', 'Talent Acquisition Manager', 'Recruiter',
  'Compliance Officer', 'Risk Manager', 'Legal Counsel', 'General Counsel',
  'Investment Analyst', 'Investment Banker', 'Portfolio Manager', 'Venture Capital Associate',
  'Partner (VC/PE)', 'Investor Relations Manager', 'Supply Chain Manager', 'Procurement Manager',
  'Logistics Manager', 'Manufacturing Engineer', 'Quality Assurance Manager',
  'Research Scientist', 'Research Engineer', 'Academic Researcher', 'Professor',
  'Healthcare Administrator', 'Clinical Data Manager', 'Biomedical Engineer',
  'Telecom Engineer', 'RF Engineer', 'Network Architect', 'Blockchain Engineer',
  'Web3 Developer', 'Game Developer', 'Technical Writer', 'Developer Advocate',
  'Developer Relations Manager', 'Community Manager', 'Content Strategist',
  'Chief Data Officer', 'Chief AI Officer', 'Chief Product Officer', 'Chief Revenue Officer',
  'Regional Director', 'Country Manager', 'Managing Director', 'Vice President',
  'Senior Vice President', 'Executive Vice President', 'Board Member', 'Advisor',
  'Independent Consultant', 'Freelance Developer', 'Startup Founder', 'Product Owner',
  'Release Manager', 'Change Manager', 'IT Auditor', 'Penetration Tester', 'Cloud Security Engineer',
  'Data Privacy Officer', 'Chief Compliance Officer', 'Treasury Manager', 'Controller',
  'Business Intelligence Analyst', 'Analytics Manager', 'Insights Manager', 'Growth Marketer',
  'Performance Marketing Manager', 'Brand Manager', 'Category Manager', 'E-commerce Manager',
  'Retail Operations Manager', 'Store Manager', 'Franchise Owner', 'Restaurant Owner',
  'Hospitality Manager', 'Real Estate Manager', 'Construction Project Manager', 'Civil Engineer',
  'Mechanical Engineer', 'Electrical Engineer', 'Energy Analyst', 'Sustainability Manager',
  'ESG Analyst', 'Public Policy Analyst', 'Government Relations Manager', 'Diplomat',
];

export const INDUSTRIES: string[] = [
  'IT Services', 'Product/SaaS', 'BFSI', 'Retail & E-comm', 'Manufacturing', 'Healthcare',
  'Telecom', 'Public Sector', 'Education', 'Energy', 'Logistics', 'Other',
];

export const SENIORITY_OPTIONS: { value: 'ic' | 'lead' | 'head' | 'cxo'; title: string; sub: string }[] = [
  { value: 'ic', title: 'Individual Contributor', sub: 'You execute and build — the brief should give you technical currency.' },
  { value: 'lead', title: 'Lead / Manager', sub: 'You run a team or a workstream — you need altitude on top of the details.' },
  { value: 'head', title: 'Head / Director', sub: 'You set direction for a function — market and competitive signal matters most.' },
  { value: 'cxo', title: 'CXO / Founder', sub: 'You own outcomes end to end — the brief should read like an analyst briefing.' },
];

export const TOPIC_SEED: string[] = [
  'Artificial intelligence', 'Cloud computing', 'Cybersecurity', 'Data & analytics',
  'DevOps & platform engineering', 'Software architecture', 'Product management',
  'Enterprise software', 'Startups & funding', 'Fintech', 'Regulation & compliance',
  'Leadership & management', 'Sales & business development', 'Marketing & growth',
  'Mergers & acquisitions', 'Global markets', 'Indian economy', 'Semiconductors & hardware',
  'Telecom & networks', 'Healthcare tech', 'Climate & energy', 'Supply chain & logistics',
  'Web3 & blockchain', 'Developer tools',
];

export const GOAL_OPTIONS: { value: string; label: string }[] = [
  { value: 'stay_current', label: 'Stay technically current' },
  { value: 'win_deals', label: 'Win more deals' },
  { value: 'move_leadership', label: 'Move into leadership' },
  { value: 'switch_domains', label: 'Switch domains or roles' },
  { value: 'sound_sharp', label: 'Sound sharp with clients' },
  { value: 'track_industry', label: 'Track my industry' },
];

export const LENS_LABELS: Record<string, { label: string; hint: string }> = {
  global: { label: 'Global', hint: 'Major world and industry news' },
  national: { label: 'National', hint: "News from your country" },
  local: { label: 'Local', hint: 'News from your city/region' },
  your_world: { label: 'Your World', hint: 'Your company, clients and market' },
  your_craft: { label: 'Your Craft', hint: 'Your specific role and skills' },
};
