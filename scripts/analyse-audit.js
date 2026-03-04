const data = require('./parser-audit-results.json');
const results = data.results;

const scanned = results.filter(r => r.confidence === 0);
const nonCvLow = results.filter(r => r.confidence > 0 && r.confidence < 60);
const actualCVs = results.filter(r => r.confidence >= 60);

console.log('=== ACTUAL CV COUNT ANALYSIS ===');
console.log('Total PDFs:', results.length);
console.log('Scanned/image (conf=0):', scanned.length);
console.log('Non-CV/junk (conf 1-59):', nonCvLow.length);
console.log('Actual CVs (conf 60+):', actualCVs.length);
console.log('');

const zeroRoles = actualCVs.filter(r => r.roleCount === 0);
const oneRole = actualCVs.filter(r => r.roleCount === 1);
const twoThree = actualCVs.filter(r => r.roleCount >= 2 && r.roleCount <= 3);
const fourPlus = actualCVs.filter(r => r.roleCount >= 4);
const sumOverflow = actualCVs.filter(r => r.issues.some(i => i.startsWith('SUMMARY_OVERFLOW')));
const missingFields = actualCVs.filter(r => r.issues.some(i => i.startsWith('ROLE_MISSING_TITLE') || i.startsWith('ROLE_MISSING_COMPANY')));
const swapped = actualCVs.filter(r => r.issues.some(i => i.startsWith('TITLE_LOOKS_LIKE') || i.startsWith('COMPANY_LOOKS_LIKE')));
const dateAnom = actualCVs.filter(r => r.issues.some(i => i.startsWith('DATE_ANOMALY') || i.startsWith('DATE_INVERTED')));
const noBullets = actualCVs.filter(r => r.issues.some(i => i.startsWith('ROLE_NO_BULLETS')));

console.log('=== AMONG ' + actualCVs.length + ' ACTUAL CVs ===');
console.log('0 roles (total failure):', zeroRoles.length, '(' + Math.round(zeroRoles.length/actualCVs.length*100) + '%)');
console.log('1 role (suspicious):', oneRole.length, '(' + Math.round(oneRole.length/actualCVs.length*100) + '%)');
console.log('2-3 roles:', twoThree.length);
console.log('4+ roles:', fourPlus.length, '(' + Math.round(fourPlus.length/actualCVs.length*100) + '%)');
console.log('');
console.log('Summary overflow (content leaked in):', sumOverflow.length, '(' + Math.round(sumOverflow.length/actualCVs.length*100) + '%)');
console.log('Roles missing title or company:', missingFields.length, '(' + Math.round(missingFields.length/actualCVs.length*100) + '%)');
console.log('Title/company likely swapped:', swapped.length, '(' + Math.round(swapped.length/actualCVs.length*100) + '%)');
console.log('Date anomalies:', dateAnom.length, '(' + Math.round(dateAnom.length/actualCVs.length*100) + '%)');
console.log('Roles with no bullets:', noBullets.length, '(' + Math.round(noBullets.length/actualCVs.length*100) + '%)');
console.log('');

// Reasonably parsed
const wellParsed = actualCVs.filter(r => r.roleCount >= 2 && !r.issues.some(i => i.startsWith('SUMMARY_OVERFLOW') || i.startsWith('ZERO_ROLES')));
console.log('Reasonably parsed (2+ roles, no summary overflow):', wellParsed.length, '(' + Math.round(wellParsed.length/actualCVs.length*100) + '%)');
console.log('');

console.log('=== ZERO ROLES — ACTUAL CVs (conf 60+) ===');
zeroRoles.forEach((r, i) => {
  const so = r.summaryLength > 0 ? ' [summary ' + r.summaryLength + ' chars]' : '';
  console.log((i+1) + '. [conf ' + r.confidence + '] ' + r.file.slice(0,70) + so);
});

console.log('\n=== SUMMARY OVERFLOW (no zero roles) ===');
const overflowOnly = sumOverflow.filter(r => r.roleCount > 0);
overflowOnly.slice(0, 30).forEach((r, i) => {
  console.log((i+1) + '. [' + r.roleCount + ' roles] ' + r.file.slice(0,60) + ' — summary ' + r.summaryLength + ' chars');
});

console.log('\n=== TITLE/COMPANY ISSUES (sample) ===');
swapped.slice(0,20).forEach((r,i) => {
  const issues = r.issues.filter(x => x.startsWith('TITLE_LOOKS_LIKE') || x.startsWith('COMPANY_LOOKS_LIKE'));
  console.log((i+1) + '. ' + r.file.slice(0,50));
  issues.forEach(x => console.log('   ' + x));
});

console.log('\n=== DATE ANOMALY SAMPLES ===');
dateAnom.slice(0,20).forEach((r,i) => {
  const issues = r.issues.filter(x => x.startsWith('DATE_ANOMALY') || x.startsWith('DATE_INVERTED'));
  if (issues.length > 0) {
    console.log((i+1) + '. ' + r.file.slice(0,50));
    issues.slice(0,3).forEach(x => console.log('   ' + x));
  }
});
