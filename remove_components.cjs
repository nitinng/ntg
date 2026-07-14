const fs = require('fs');
let content = fs.readFileSync('App.tsx', 'utf-8');

const p1 = /const IgathpuriMeetupView =.*?^const PolicyManagement =/ms;
content = content.replace(p1, 'const PolicyManagement =');

const p2 = /const MeetupApprovalsView =.*?^const checkPolicyViolation =/ms;
content = content.replace(p2, 'const checkPolicyViolation =');

fs.writeFileSync('App.tsx', content, 'utf-8');
