// Progressive enhancement: the complete geographic directory is in the HTML.
const search = document.querySelector('#area-search');
if (search) {
  const groups = [...document.querySelectorAll('.area-group')];
  const states = [...document.querySelectorAll('.state-directory')];
  const status = document.querySelector('#area-results');
  const normalize = text => text.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const originalOpen = new Map(groups.map(group => [group, group.open]));
  search.addEventListener('input', () => {
    const query = normalize(search.value.trim());
    let count = 0;
    for (const group of groups) {
      const regionMatches = normalize(group.querySelector('summary').textContent).includes(query);
      let visible = 0;
      for (const city of group.querySelectorAll('li')) {
        city.hidden = Boolean(query) && !regionMatches && !normalize(city.textContent).includes(query);
        if (!city.hidden) visible++;
      }
      group.hidden = !visible;
      group.open = query ? visible > 0 : originalOpen.get(group);
      count += visible;
    }
    for (const state of states) state.hidden = [...state.querySelectorAll('.area-group')].every(group => group.hidden);
    status.textContent = query ? `${count} matching locations. Clear the search to browse all regions.` : '';
  });
}
