import california from './california-areas.json' with { type: 'json' };
export const areaStates = [
  { id:'california',name:'California',groups:california, resource:['California CSLB hiring resources','https://www.cslb.ca.gov/Consumers/Hire_A_Contractor/'] },
  { id:'washington',name:'Washington',resource:['Washington L&I hiring resources','https://www.lni.wa.gov/licensing-permits/contractors/hiring-a-contractor/'],groups:[
    {region:'Seattle and Eastside region',places:['Seattle','Bellevue','Redmond','Kirkland','Sammamish','Issaquah','Mercer Island','Newcastle','Woodinville','Bothell']},
    {region:'South King County region',places:['Renton','Kent','Auburn','Federal Way','Burien','Tukwila','SeaTac','Des Moines','Covington','Maple Valley','Enumclaw']},
    {region:'Snohomish County region',places:['Everett','Lynnwood','Edmonds','Mukilteo','Mill Creek','Marysville','Arlington','Lake Stevens','Snohomish','Monroe']},
    {region:'Tacoma and Pierce County region',places:['Tacoma','Lakewood','Puyallup','University Place','Gig Harbor','Bonney Lake','Sumner','Fife','DuPont','Orting']},
    {region:'Olympia and Thurston County region',places:['Olympia','Lacey','Tumwater','Yelm']},
    {region:'Kitsap Peninsula region',places:['Bremerton','Bainbridge Island','Poulsbo','Port Orchard']},
    {region:'Vancouver and southwest Washington',places:['Vancouver','Camas','Washougal','Battle Ground','Ridgefield','La Center','Longview','Kelso','Woodland','Centralia','Chehalis']},
    {region:'Northwest Washington',places:['Bellingham','Ferndale','Lynden','Mount Vernon','Burlington','Anacortes','Oak Harbor','Port Townsend','Sequim','Port Angeles']},
    {region:'Spokane and eastern Washington',places:['Spokane','Spokane Valley','Liberty Lake','Cheney','Airway Heights','Pullman','Clarkston','Walla Walla']},
    {region:'Central Washington and Tri-Cities',places:['Wenatchee','East Wenatchee','Ellensburg','Yakima','Selah','Richland','West Richland','Kennewick','Pasco','Moses Lake']},
  ] },
];

export const areaPage = {
  path:'/locations/', title:'California & Washington Service Areas',
  description:'We accept contractor quote submissions statewide in California and Washington. Browse cities and regions; contractor matching depends on availability.',
  // Statewide submissions confirmed by the operator; matches remain availability-dependent.
  directory:true,
};
