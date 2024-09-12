import * as fs from 'fs';
import axios from 'axios';

const tkn = fs.readFileSync('./token').toString();
const baseRoute = 'https://canvas.uts.edu.au';

function get(route: string, args: string[] = [], noBase = false): Promise<axios.AxiosResponse> {
    args.push('access_token=' + tkn);
    const path = (noBase ? '' : baseRoute) + route + (route.includes('?') ? '&' : '?') + args.join('&');
    // @ts-expect-error
    return axios.get(path);
}

async function pagedGet(route: string, args: string[] = [], flattenResults = true): Promise<any[]> {

    let page = await get(route, args);
    const results: Array<any> = [await page.data];

    while ('link' in page.headers && typeof page.headers.link === 'string' && page.headers.link.includes('; rel="next"')) {
        const nextURL = page.headers.link.split(',').find((l) => l.includes('; rel="next"'))!.split(';')[0].slice(1, -1);
        page = await get(nextURL, [], true);
        results.push(await page.data);
    }

    return flattenResults ? results.flat() : results;
}

const courses = await pagedGet('/api/v1/courses', ['include[]=term']);
fs.writeFileSync('./courses.json', JSON.stringify(courses, null, 4));

console.log('Active Course Names:');
courses.forEach((course: any) => (course.term.end_at === null || Date.parse(course.term.end_at) > Date.now()) ? console.log('   ->', course.name) : '');

console.log('\nUpcoming Assignments:');

const assignments = (await Promise.all(
    courses
        .filter((course: any) => typeof course === 'object' &&
            course !== null &&
            typeof course.id === 'number'
        ).map((course: any) => pagedGet(`/api/v1/courses/${course.id}/assignments`))
)).flat();

fs.writeFileSync('./assignments.json', JSON.stringify(assignments, null, 4));

const now = Date.now();
const dueAssignments = assignments
    .filter(n => n.name != 'SYS_EXCEPTION_GRADE' && typeof n.due_at == 'string' && Date.parse(n.due_at) - now > 0);

dueAssignments.forEach(n => n.epochTime = Date.parse(n.due_at));
dueAssignments
    .sort((a, b) => a.epochTime - b.epochTime)
    .map(n => `    [${n.has_submitted_submissions ? '*' : ' '}][${n.due_at.slice(0, -1).replace('T', ' ')}]: ${n.course_id} - ${n.name}`).forEach((s) => console.log(s));
