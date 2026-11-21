/**
 * First-level regions (states, provinces, prefectures...) for the countries where a business address almost always
 * names one. The stored value is the region's name, written as it appears on a postal address, which is what
 * schema.org's `addressRegion` expects. A country missing from this list gets a free-text field instead.
 */
export const REGIONS: Record<string, string[]> = {
	AE: ['Abu Dhabi', 'Ajman', 'Dubai', 'Fujairah', 'Ras Al Khaimah', 'Sharjah', 'Umm Al Quwain'],
	AU: [
		'Australian Capital Territory', 'New South Wales', 'Northern Territory', 'Queensland', 'South Australia',
		'Tasmania', 'Victoria', 'Western Australia',
	],
	BD: ['Barishal', 'Chattogram', 'Dhaka', 'Khulna', 'Mymensingh', 'Rajshahi', 'Rangpur', 'Sylhet'],
	BR: [
		'Acre', 'Alagoas', 'Amapá', 'Amazonas', 'Bahia', 'Ceará', 'Distrito Federal', 'Espírito Santo', 'Goiás',
		'Maranhão', 'Mato Grosso', 'Mato Grosso do Sul', 'Minas Gerais', 'Pará', 'Paraíba', 'Paraná', 'Pernambuco',
		'Piauí', 'Rio de Janeiro', 'Rio Grande do Norte', 'Rio Grande do Sul', 'Rondônia', 'Roraima',
		'Santa Catarina', 'São Paulo', 'Sergipe', 'Tocantins',
	],
	CA: [
		'Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador',
		'Northwest Territories', 'Nova Scotia', 'Nunavut', 'Ontario', 'Prince Edward Island', 'Quebec',
		'Saskatchewan', 'Yukon',
	],
	CN: [
		'Anhui', 'Beijing', 'Chongqing', 'Fujian', 'Gansu', 'Guangdong', 'Guangxi', 'Guizhou', 'Hainan', 'Hebei',
		'Heilongjiang', 'Henan', 'Hubei', 'Hunan', 'Inner Mongolia', 'Jiangsu', 'Jiangxi', 'Jilin', 'Liaoning',
		'Ningxia', 'Qinghai', 'Shaanxi', 'Shandong', 'Shanghai', 'Shanxi', 'Sichuan', 'Tianjin', 'Tibet', 'Xinjiang',
		'Yunnan', 'Zhejiang',
	],
	DE: [
		'Baden-Württemberg', 'Bavaria', 'Berlin', 'Brandenburg', 'Bremen', 'Hamburg', 'Hesse', 'Lower Saxony',
		'Mecklenburg-Vorpommern', 'North Rhine-Westphalia', 'Rhineland-Palatinate', 'Saarland', 'Saxony',
		'Saxony-Anhalt', 'Schleswig-Holstein', 'Thuringia',
	],
	ES: [
		'Andalusia', 'Aragon', 'Asturias', 'Balearic Islands', 'Basque Country', 'Canary Islands', 'Cantabria',
		'Castile and León', 'Castilla-La Mancha', 'Catalonia', 'Ceuta', 'Extremadura', 'Galicia', 'La Rioja',
		'Madrid', 'Melilla', 'Murcia', 'Navarre', 'Valencian Community',
	],
	FR: [
		'Auvergne-Rhône-Alpes', 'Bourgogne-Franche-Comté', 'Brittany', 'Centre-Val de Loire', 'Corsica', 'Grand Est',
		'Guadeloupe', 'French Guiana', 'Hauts-de-France', 'Île-de-France', 'La Réunion', 'Martinique', 'Mayotte',
		'Normandy', 'Nouvelle-Aquitaine', 'Occitanie', 'Pays de la Loire', "Provence-Alpes-Côte d'Azur",
	],
	GB: ['England', 'Northern Ireland', 'Scotland', 'Wales'],
	IN: [
		'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh',
		'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana',
		'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep',
		'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry',
		'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
		'West Bengal',
	],
	IT: [
		'Abruzzo', 'Aosta Valley', 'Apulia', 'Basilicata', 'Calabria', 'Campania', 'Emilia-Romagna',
		'Friuli-Venezia Giulia', 'Lazio', 'Liguria', 'Lombardy', 'Marche', 'Molise', 'Piedmont', 'Sardinia', 'Sicily',
		'Trentino-South Tyrol', 'Tuscany', 'Umbria', 'Veneto',
	],
	JP: [
		'Aichi', 'Akita', 'Aomori', 'Chiba', 'Ehime', 'Fukui', 'Fukuoka', 'Fukushima', 'Gifu', 'Gunma', 'Hiroshima',
		'Hokkaido', 'Hyogo', 'Ibaraki', 'Ishikawa', 'Iwate', 'Kagawa', 'Kagoshima', 'Kanagawa', 'Kochi', 'Kumamoto',
		'Kyoto', 'Mie', 'Miyagi', 'Miyazaki', 'Nagano', 'Nagasaki', 'Nara', 'Niigata', 'Oita', 'Okayama', 'Okinawa',
		'Osaka', 'Saga', 'Saitama', 'Shiga', 'Shimane', 'Shizuoka', 'Tochigi', 'Tokushima', 'Tokyo', 'Tottori',
		'Toyama', 'Wakayama', 'Yamagata', 'Yamaguchi', 'Yamanashi',
	],
	MX: [
		'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Chihuahua',
		'Coahuila', 'Colima', 'Durango', 'Guanajuato', 'Guerrero', 'Hidalgo', 'Jalisco', 'Mexico City',
		'México', 'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro', 'Quintana Roo',
		'San Luis Potosí', 'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán',
		'Zacatecas',
	],
	MY: [
		'Johor', 'Kedah', 'Kelantan', 'Kuala Lumpur', 'Labuan', 'Malacca', 'Negeri Sembilan', 'Pahang', 'Penang',
		'Perak', 'Perlis', 'Putrajaya', 'Sabah', 'Sarawak', 'Selangor', 'Terengganu',
	],
	NG: [
		'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta',
		'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'Federal Capital Territory', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano',
		'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau',
		'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
	],
	NZ: [
		'Auckland', 'Bay of Plenty', 'Canterbury', 'Gisborne', "Hawke's Bay", 'Manawatū-Whanganui', 'Marlborough',
		'Nelson', 'Northland', 'Otago', 'Southland', 'Taranaki', 'Tasman', 'Waikato', 'Wellington', 'West Coast',
	],
	PK: [
		'Azad Kashmir', 'Balochistan', 'Gilgit-Baltistan', 'Islamabad Capital Territory', 'Khyber Pakhtunkhwa',
		'Punjab', 'Sindh',
	],
	US: [
		'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware',
		'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas',
		'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi',
		'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York',
		'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island',
		'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
		'West Virginia', 'Wisconsin', 'Wyoming',
	],
	ZA: [
		'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West',
		'Northern Cape', 'Western Cape',
	],
};
