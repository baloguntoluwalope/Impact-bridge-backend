'use strict';

/**
 * SDG Content Seed Data
 * ─────────────────────────────────────────────────────────────
 * 17 SDGs × 3 items = 51 documents
 * Content types : text, pdf, infographic, audio, video, quiz
 * Languages     : en (English), ha (Hausa), yo (Yoruba), ig (Igbo)
 *
 * Usage (standalone script):
 *   node sdgContent.seed.js
 *
 * Usage (inside your main seeder):
 *   const { seedSDGContent } = require('./sdgContent.seed');
 *   await seedSDGContent();
 *
 * NOTE: Run seedSDGs() first so SDG documents exist for ObjectId lookups.
 */

const path     = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const mongoose           = require('mongoose');
const SDG                = require('./sdg.model');
const Content            = require('./sdgContent.model');
const { getRedisClient } = require('../../config/redis');

// ─────────────────────────────────────────────────────────────
// RAW SEED DATA  (no ObjectId refs yet — resolved at runtime)
// ─────────────────────────────────────────────────────────────
const SDG_CONTENT_SEED = [

  // ── SDG 1 · No Poverty ──────────────────────────────────────
  {
    sdg_number: 1, language: 'en', content_type: 'text',
    title: 'Understanding Poverty in Nigeria',
    body: 'Nigeria has one of the largest populations living in extreme poverty globally, with over 40% of citizens surviving on less than $1.90 per day. Poverty in Nigeria is concentrated in rural northern states, where access to education, healthcare, and economic opportunity remains limited. The federal government\'s social investment programmes — including the Conditional Cash Transfer scheme — aim to reach the most vulnerable households. Structural barriers such as unemployment, poor infrastructure, and climate shocks continue to deepen inequality. Community-led savings groups (Ajo and Esusu) have proven effective grassroots tools for poverty reduction.',
    target_audience: 'community', is_published: true, views: 342,
    tags: ['poverty', 'nigeria', 'sustainability', 'equality'],
    student_actions: ['Map poverty hotspots in your local government area', 'Interview a community savings group coordinator'],
    examples: ['Kano State conditional cash transfer programme reaching 50,000 households', 'Women Ajo groups in Oyo State pooling ₦500,000 monthly'],
    club_activity: 'Create a classroom savings jar and discuss how pooled resources help communities',
    read_time: 5, media_url: 'https://media.sdg-nigeria.org/sdg1/understanding-poverty-nigeria.pdf',
  },
  {
    sdg_number: 1, language: 'ha', content_type: 'audio',
    title: 'Talauci da Yadda Zamu Kawar Da Shi',
    body: 'Talauci babbar matsala ce da ke addabar al\'ummar Najeriya, musamman a yankunan arewa. Yawancin iyalai ba su da isasshen abinci, makaranta, ko magani. Shirin tallafi na gwamnatin tarayya yana taimakawa iyalai masu rauni ta hanyar ba da kudi kai tsaye. Harkar noma ta zamani da ƙananan masana\'antu na iya taimaka wa matasa samun aiki. Yin amfani da fasahar zamani wajen sayar da kayayyaki na iya ƙara samun kuɗi a gidaje.',
    target_audience: 'community', is_published: true, views: 198,
    tags: ['poverty', 'nigeria', 'youth', 'education'],
    student_actions: ['Tattauna game da ayyukan tallafi a ƙauye', 'Rubuta hanyoyin da za a iya taimakawa matalauta'],
    examples: ['Shirin Conditional Cash Transfer a jihar Kano', 'Ƙungiyoyin ajiya na mata a Katsina'],
    club_activity: 'Shirya wasan kwaikwayo kan yadda kuɗin ajiya ke taimakawa iyali',
    read_time: 4, media_url: 'https://media.sdg-nigeria.org/sdg1/talauci-hausa.mp3',
  },
  {
    sdg_number: 1, language: 'yo', content_type: 'infographic',
    title: 'Osi ati Bí A Ṣe Lè Dojú Kọ Rẹ̀',
    body: 'Osi jẹ́ ọ̀rọ̀ pàtàkì tó ń kan ọ̀pọ̀ ènìyàn ní Nàìjíríà, pàápàá àwọn tó ń gbé ní àgbègbè igbó. Ìdá mẹ́rin nínú mẹ́wàá àwọn ará Nàìjíríà ń gbé lórí ìsàlẹ̀ $1.90 lójọ kan. Àwọn ètò ìjọba bí National Social Investment Programme ń gbìyànjú láti fún àwọn ìdílé aláìní ní ìrànlọ́wọ́. Àgbègbè àríwá orílẹ̀-èdè ló ní ìpele osi tó ga jùlọ. Ìpínlẹ̀ tí ó ní èrè jùlọ nínú òṣìṣẹ́ obìnrin ló ń yára jáde kúrò nínú osi.',
    target_audience: 'students', is_published: true, views: 415,
    tags: ['poverty', 'equality', 'nigeria', 'sustainability'],
    student_actions: ['Ṣe àkọsílẹ̀ àwọn ìdílé aláìní nítòsí ilé ẹ̀kọ́ rẹ', 'Kọ́ nípa àwọn ètò ìrànlọ́wọ́ ìjọba'],
    examples: ['Ètò ìdárayá ìṣẹ̀ṣe Yorùbá tó ń ṣèrànwọ́ fún àwọn tó ṣòfò', 'Ìpilẹ̀ṣẹ̀ kòọ̀pà ìdílé ní Ìbàdàn'],
    club_activity: 'Ṣe àwòrán tó ń fi àwọn ẹgbẹ́ ajọṣe ìdílé hàn',
    read_time: 3, media_url: 'https://media.sdg-nigeria.org/sdg1/osi-infographic-yoruba.png',
  },

  // ── SDG 2 · Zero Hunger ──────────────────────────────────────
  {
    sdg_number: 2, language: 'en', content_type: 'video',
    title: 'Food Security Challenges Across Nigeria',
    body: 'Nigeria faces a growing food security crisis driven by climate change, conflict in farming regions, and post-harvest losses estimated at 40% of produce. The northeast insurgency has displaced millions of smallholder farmers, severely disrupting food production in the Lake Chad basin. Nigeria\'s National Agricultural Development Fund is investing in irrigation and storage infrastructure to reduce dependence on rain-fed agriculture. Staple crops such as cassava, yam, and sorghum remain central to food security strategies. Nutrition programmes targeting children under five are critical to reversing the high stunting rates in the northwest and northeast.',
    target_audience: 'government', is_published: true, views: 289,
    tags: ['sustainability', 'nigeria', 'health', 'poverty'],
    student_actions: ['Visit a local farm and document food production methods', 'Calculate food waste in your school canteen for one week'],
    examples: ['Kebbi State dry-season rice farming producing 6 million bags annually', 'IITA cassava biofortification programme in Oyo State'],
    club_activity: 'Plant a small school garden and track growth to understand food production',
    read_time: 6, media_url: 'https://media.sdg-nigeria.org/sdg2/food-security-nigeria.mp4',
  },
  {
    sdg_number: 2, language: 'ig', content_type: 'text',
    title: 'Nri na Nchekwa Nri na Naịjịrịa',
    body: 'Ọnọdụ nri na Naịjịrịa bụ ihe na-atọ ụtọ mana yana nsogbu dị ukwuu. Ọtụtụ ezinụlọ n\'ime mpaghara ugbo-ala na-enweghị nri ezuru oke n\'ihi ọchịchọ ihu igwe na-agbanwe agbanwe. Nkwalite ọrụ ugbo-ala dị mkpa iji mezuo ihe achọrọ n\'nri nke ndị mmadụ niile. Ọrụ nke IITA na teknọlọjị cassava biofortified na-enyere ndị ọrụ ugbo aka iji nọrọ n\'ọnọdụ. Mwepu nri na mgbakọ nri n\'oge ogige bụ ụzọ dị mma iji belata ọnọdụ agụụ na obodo.',
    target_audience: 'community', is_published: true, views: 176,
    tags: ['nigeria', 'sustainability', 'health', 'poverty'],
    student_actions: ['Dee ihe ọ bụla ndị bi n\'obodo gị na-eri n\'ụbọchị', 'Mee nyocha banyere ọnọdụ nri n\'ụlọ akwụkwọ gị'],
    examples: ['Ọrụ ugbo cassava nke IITA na Oyo State', 'Ụlọ nchekwa nri nke Federal Government na Benue State'],
    club_activity: 'Kpụọ ihe oriri dị iche iche wee kọọ ihe ha bara uru n\'ahụike',
    read_time: 4, media_url: 'https://media.sdg-nigeria.org/sdg2/nri-igbo.pdf',
  },
  {
    sdg_number: 2, language: 'ha', content_type: 'quiz',
    title: 'Gwajin Ilimin Abinci da Noma',
    body: 'Wannan gwajin yana taimaka wa dalibai su gwada ilimin su game da noma da tsaro na abinci a Najeriya. Yawan amfanin gona da kuma hanyoyin adana abinci sun kasance mahimman batutuwa a cikin karatun SDG 2. Gwamnatin tarayya tana ba da tallafi ga manoma ta hanyar NIRSAL da sauran shirye-shirye. Canjin yanayi na shafar samar da abinci a arewacin Najeriya musamman. Dalibai za su iya taimakawa wajen rage asarar abinci ta hanyar koyon dabarun adana abinci.',
    target_audience: 'students', is_published: true, views: 310,
    tags: ['education', 'nigeria', 'sustainability', 'innovation'],
    student_actions: ['Amsa tambayoyin gwajin kan tsaro na abinci', 'Share sakamakon gwajin da abokanka'],
    examples: ['Manoman shinkafa a Kebbi da ke amfani da ban ruwa', 'Shirin NIRSAL na tallafin manoma ƙanana'],
    club_activity: 'Shirya gasar gwaji kan ilimin noma a tsakanin azuzuwa',
    read_time: 3, media_url: 'https://media.sdg-nigeria.org/sdg2/quiz-noma-hausa.json',
  },

  // ── SDG 3 · Good Health ──────────────────────────────────────
  {
    sdg_number: 3, language: 'en', content_type: 'pdf',
    title: 'Primary Healthcare Delivery in Nigeria',
    body: 'Nigeria\'s primary healthcare system serves as the first point of contact for over 200 million citizens, yet less than 20% of PHC facilities are fully functional according to NPHCDA assessments. Maternal mortality remains one of the highest in the world at approximately 512 per 100,000 live births, largely due to inadequate skilled birth attendance. The Basic Health Care Provision Fund (BHCPF) was established to improve financing and availability of essential medicines. Community Health Extension Workers (CHEWs) are critical frontline health workers bridging the gap between communities and formal health systems. Immunisation coverage for childhood diseases like polio and measles has improved significantly through NPHCDA-led campaigns.',
    target_audience: 'ngo', is_published: true, views: 504,
    tags: ['health', 'nigeria', 'sustainability', 'education'],
    student_actions: ['Visit your nearest PHC and report on services available', 'Research the role of CHEWs in your community'],
    examples: ['Jigawa State PHC revitalisation programme reducing maternal deaths by 30%', 'Lagos State BHCPF disbursement reaching 762 health facilities'],
    club_activity: 'Organise a health talk on handwashing and basic hygiene for younger students',
    read_time: 7, media_url: 'https://media.sdg-nigeria.org/sdg3/phc-delivery-nigeria.pdf',
  },
  {
    sdg_number: 3, language: 'yo', content_type: 'video',
    title: 'Ìlera Tó Dára: Àwọn Ìpèníjà Ní Nàìjíríà',
    body: 'Ìlera rere jẹ́ ẹ̀tọ́ gbogbo ènìyàn, àmọ́ ọ̀pọ̀ àwọn ará Nàìjíríà kò ní ànfààní sí ìtọ́jú ìlera tó péye. Ọ̀pọ̀ àwọn obìnrin ti ń kú ní àkókò ìbímọ ní Nàìjíríà ju níbikíbi lọ ní Áfríkà. Àwọn Òṣìṣẹ́ Ìlera Àdùgbò (CHEWs) ń ṣiṣẹ́ takuntakun láti mú ìtọ́jú ìlera dé àwọn àdùgbò tó jìnnà. Ajẹsara fún àwọn ọmọ kékeré ti ń dára sí i nípasẹ̀ àwọn ìpolongo NPHCDA. Ìjọba Ìpínlẹ̀ Làgos ń gbìyànjú láti mú àwọn ilé ìwòsàn di àárọ̀ sí ènìyàn.',
    target_audience: 'community', is_published: true, views: 389,
    tags: ['health', 'nigeria', 'sustainability', 'equality'],
    student_actions: ['Ṣe ìwádìí lórí àwọn iṣẹ́ tí PHC àdùgbò rẹ ń pèsè', 'Kọ́ nípa àwọn àmì àìsàn tó wọ́pọ̀ àti bí a ṣe ń dènà wọn'],
    examples: ['Ètò ìlera aboyún ní Ìpínlẹ̀ Oṣun tó ti dín àárọ̀ kù', 'Ìpolongo ajẹsara kíkorò ní Kano tó dé ọmọ mílíọ̀nù kan'],
    club_activity: 'Ṣètò ọ̀rọ̀ alẹ́ ìlera lórí ìwẹ̀ ọwọ́ àti ìmọ̀tọ́tọ́',
    read_time: 5, media_url: 'https://media.sdg-nigeria.org/sdg3/ilera-video-yoruba.mp4',
  },
  {
    sdg_number: 3, language: 'ig', content_type: 'infographic',
    title: 'Nchekwa Ahụike na Naịjịrịa',
    body: 'Ahụike ọma bụ ihe dị mkpa maka ndụ ọ bụla. Na Naịjịrịa, ọnọdụ ụlọ ọrịa bụ nsogbu ukwuu n\'ihi enweghị ego ezuru oke. Ọnwụ nke ụmụ nwanyị na-amụ ọmụmụ bụ nsogbu ukwuu nke na-adabere na enweghị ndị ọrụ ahụike ọkachamara. Vaccination nke ụmụaka maka ọrịa dị ka ọ̀tụ̀tụ̀ na malaria na-enyere ụmụaka aka idozi ndụ ha. Ndị ọrụ CHEW bụ ihe dị mkpa n\'obodo maka ịkwado nke ọma nchekwa ahụike.',
    target_audience: 'students', is_published: true, views: 231,
    tags: ['health', 'nigeria', 'education', 'sustainability'],
    student_actions: ['Zụọ ụlọ ọrịa dị nso wee kọọ ihe ha na-enye', 'Mụọ gbasara mkpọlite CHEW na obodo gị'],
    examples: ['Ọrụ vaccination nke NPHCDA na Kano bụ ihe ọma', 'Usoro ahụike nke ụmụ nwanyị na Imo State'],
    club_activity: 'Kpụọ ọgbakọ banyere ịsa aka na nchekwa ahụike maka ụmụ akwụkwọ obere',
    read_time: 3, media_url: 'https://media.sdg-nigeria.org/sdg3/ahuike-infographic-igbo.png',
  },

  // ── SDG 4 · Quality Education ───────────────────────────────
  {
    sdg_number: 4, language: 'en', content_type: 'text',
    title: 'The State of Education in Nigeria',
    body: 'Nigeria has one of the world\'s largest populations of out-of-school children, with over 10.5 million primary-age children not attending school, particularly concentrated in the northwest and northeast. The Universal Basic Education Commission (UBEC) provides matching grants to states for school construction, rehabilitation, and instructional materials. Teacher quality remains a persistent challenge, with many public schools lacking qualified instructors in core subjects like mathematics and science. The Girls\' Education Initiative is working to close the gender gap in enrolment, especially in states with Almajiri traditions. Digital learning platforms and mobile-based education tools are increasingly complementing traditional classroom instruction.',
    target_audience: 'teachers', is_published: true, views: 621,
    tags: ['education', 'nigeria', 'equality', 'innovation'],
    student_actions: ['Find out how many out-of-school children live in your LGA', 'Volunteer to tutor a younger student in your community'],
    examples: ['Edo State EDUKOYA platform connecting 200,000 students to digital content', 'Sokoto State\'s Tsangaya integration programme bringing Almajiri into formal schools'],
    club_activity: 'Organise a read-a-thon to raise awareness about literacy in your community',
    read_time: 6, media_url: 'https://media.sdg-nigeria.org/sdg4/education-state-nigeria.pdf',
  },
  {
    sdg_number: 4, language: 'ha', content_type: 'audio',
    title: 'Ilimi Mai Inganci don Kowa',
    body: 'Ilimi shine mabuɗin ci gaban kowane al\'umma. A Najeriya, akwai yara miliyan 10.5 da ba sa zuwa makaranta, musamman a arewacin ƙasar. Gwamnatin tarayya ta kafa hukumar UBEC don tabbatar da ilimi na asali kyauta ga dukan yara. Ƙalubalen da malamai ke fuskanta, kamar rashin horo da kuma ƙarancin albashin, na shafar ingancin karatun. Tsarin Almajiri yana buƙatar a haɗa shi da tsarin ilimi na zamani don samun sakamako mafi kyau.',
    target_audience: 'teachers', is_published: true, views: 287,
    tags: ['education', 'nigeria', 'youth', 'equality'],
    student_actions: ['Tattauna matsalolin da yara tsangaya ke fuskanta', 'Shirya ƙungiyar karatu a unguwarku'],
    examples: ['Shirin haɗa makarantar Tsangaya a Sokoto', 'Hukumar UBEC ta gina makarantun firamare 5000 a Arewa'],
    club_activity: 'Shirya gasar karatun litattafai a azuzuwan makaranta',
    read_time: 4, media_url: 'https://media.sdg-nigeria.org/sdg4/ilimi-audio-hausa.mp3',
  },
  {
    sdg_number: 4, language: 'ig', content_type: 'quiz',
    title: 'Ule Maka Ọmụmụ Na Naịjịrịa',
    body: 'Ule a na-enyere ụmụ akwụkwọ aka ịnwalee ihe ha maara gbasara ọnọdụ ọmụmụ na Naịjịrịa. Ihe ọmụmụ dị mma bụ ihe dị mkpa maka mmepe nke obodo nọ n\'ọnọdụ dị mma. UBEC na-enyere steeti ego maka iguzobe ụlọ akwụkwọ ọhụụ na ndozi ndị dị adị. Nkụzi dị mma bụ ọdụ ụzọ maka ọmụmụ dị mma maka ụmụaka. Ụlọ akwụkwọ ndị na-eji teknọlọjị na-enyere ụmụ akwụkwọ nwee ike ọmụmụ karịa.',
    target_audience: 'students', is_published: true, views: 445,
    tags: ['education', 'nigeria', 'innovation', 'youth'],
    student_actions: ['Zaghachi ule a ma ọ bụ nwalee ihe ị maara', 'Kọọ ihe ị mụtara nye ndị ọzọ'],
    examples: ['Edukoya platform na Lagos tinyere ụmụ akwụkwọ 200,000', 'Ọrụ UBEC nke guzobere ụlọ akwụkwọ n\'Arewa Naịjịrịa'],
    club_activity: 'Mee ule ndọọ ọma n\'ime klasi ma jiri ya kọọ ihe ụmụ akwụkwọ mụtara',
    read_time: 3, media_url: 'https://media.sdg-nigeria.org/sdg4/ule-igbo.json',
  },

  // ── SDG 5 · Gender Equality ──────────────────────────────────
  {
    sdg_number: 5, language: 'en', content_type: 'infographic',
    title: 'Gender Equality: Progress and Gaps in Nigeria',
    body: 'Nigeria ranked 123rd out of 146 countries in the 2023 World Economic Forum Global Gender Gap Index, reflecting persistent inequalities in economic participation, education, and political representation. Women make up only 4% of the National Assembly, far below the 35% affirmative action target. Gender-based violence remains pervasive, with UNFPA estimating that 1 in 3 Nigerian women has experienced physical or sexual violence. The Violence Against Persons Prohibition (VAPP) Act 2015 provides a legal framework for addressing GBV, but implementation across states is inconsistent. Female entrepreneurship is a bright spot, with women owning 41% of MSMEs in Nigeria according to SMEDAN.',
    target_audience: 'ngo', is_published: true, views: 530,
    tags: ['equality', 'nigeria', 'education', 'governance'],
    student_actions: ['Research the VAPP Act and its provisions', 'Identify women leaders in your community and document their achievements'],
    examples: ['Anambra State\'s She Leads programme training 3,000 young women in leadership', 'Womenpreneur Pitch-a-ton Africa empowering female entrepreneurs across Nigeria'],
    club_activity: 'Hold a debate on gender equality in education and career opportunities',
    read_time: 5, media_url: 'https://media.sdg-nigeria.org/sdg5/gender-equality-infographic.png',
  },
  {
    sdg_number: 5, language: 'yo', content_type: 'text',
    title: 'Dọ́gba Àwọn Obìnrin àti Okùnrin ní Nàìjíríà',
    body: 'Dọ́gba àwọn obìnrin àti okùnrin jẹ́ ọ̀ràn tó ṣe pàtàkì fún ìdàgbàsókè orílẹ̀-èdè. Ní Nàìjíríà, àwọn obìnrin ní ọ̀pọ̀ àwọn ìpèníjà nínú ètò ìṣèlú, ẹ̀kọ́, àti ìṣòwò. Òfin VAPP ti ìpínlẹ̀ Nàìjíríà ṣe ìpèsè fún ìdáàbòbò àwọn tí ìwà ipá ìbálòpọ̀ bá gbé. Àwọn ìpolongo bí She Leads ń fún àwọn obìnrin alágbára ní agbára. Ẹ̀kọ́ obìnrin jẹ́ ọ̀nà tó dára jùlọ láti yọrí sí dọ́gba ní àwọn àyíká gbogbo.',
    target_audience: 'community', is_published: true, views: 301,
    tags: ['equality', 'nigeria', 'education', 'youth'],
    student_actions: ['Ṣe ìwádìí lórí àwọn obìnrin alàṣẹ ní àdùgbò rẹ', 'Kọ ìwé lórí ìdojúkọ àwọn ìpèníjà obìnrin ní ẹ̀kọ́'],
    examples: ['Ètò She Leads ní Anambra tó ti kọ́ obìnrin 3,000 nínú ìdarí', 'Àwọn obìnrin oníṣòwò tó ń jẹ ìmọ̀ nípasẹ̀ SMEDAN'],
    club_activity: 'Jíròrò lórí dọ́gba ẹ̀kọ́ àti àǹfààní iṣẹ́ fún àwọn obìnrin àti okùnrin',
    read_time: 4, media_url: 'https://media.sdg-nigeria.org/sdg5/dogba-obinrin-yoruba.pdf',
  },
  {
    sdg_number: 5, language: 'ha', content_type: 'video',
    title: 'Daidaito Tsakanin Maza da Mata',
    body: 'Daidaito tsakanin maza da mata yana da muhimmanci wajen ci gaban al\'umma. A Najeriya, mata suna fuskantar ƙalubale da yawa a harkar siyasa da tattalin arziki. Dokar VAPP ta tanadi kare hakkin mata daga cin zarafin jima\'i da na zahiri. Mata sun nuna ƙwarin gwuiwa a harkar kasuwanci, inda suke da kashi 41% na ƙananan masana\'antu. Ilimin mata shine mabuɗi mafi ƙarfi wajen cimma daidaito na gaske a cikin al\'umma.',
    target_audience: 'teachers', is_published: true, views: 248,
    tags: ['equality', 'nigeria', 'education', 'governance'],
    student_actions: ['Yi bincike kan Dokar VAPP', 'Gano mata masu jagoranci a unguwarku'],
    examples: ['Shirin She Leads a Anambra da ya horar da mata 3,000', 'Ƙungiyar mata masu kasuwanci ta SMEDAN a Kano'],
    club_activity: 'Shirya wasan kwaikwayo kan daidaito a makaranta',
    read_time: 5, media_url: 'https://media.sdg-nigeria.org/sdg5/daidaito-video-hausa.mp4',
  },

  // ── SDG 6 · Clean Water ──────────────────────────────────────
  {
    sdg_number: 6, language: 'en', content_type: 'pdf',
    title: 'Water and Sanitation Access in Nigeria',
    body: 'Access to safe drinking water remains a critical challenge in Nigeria, with only 29% of the population having access to safely managed water services according to UNICEF data. Open defecation is practiced by over 46 million Nigerians, contributing to waterborne diseases that kill thousands annually. The Federal Ministry of Water Resources has developed a National Water Supply and Sanitation Policy to guide investments and service delivery. State Urban Water Boards are responsible for piped water supply in urban areas, but many are under-funded and technically weak. Community-Led Total Sanitation (CLTS) programmes have successfully triggered behaviour change in hundreds of rural communities.',
    target_audience: 'government', is_published: true, views: 378,
    tags: ['water', 'sustainability', 'health', 'nigeria'],
    student_actions: ['Test the water quality in your school or community using a simple kit', 'Map open defecation sites in your area and report to local authorities'],
    examples: ['Ekiti State RUWASSA constructing 200 boreholes in rural communities', 'UNICEF-supported CLTS programme eliminating open defecation in 500 Kano villages'],
    club_activity: 'Design a poster campaign about safe water handling and sanitation',
    read_time: 6, media_url: 'https://media.sdg-nigeria.org/sdg6/water-sanitation-nigeria.pdf',
  },
  {
    sdg_number: 6, language: 'ig', content_type: 'audio',
    title: 'Mmiri Dị Ọcha na Nlọchapụ Ihe Njọ na Naịjịrịa',
    body: 'Mmiri ọcha bụ ihe dị mkpa maka ndụ na ahụike nke ụmụ mmadụ niile. Na Naịjịrịa, naanị pasent 29 nke ndị mmadụ nwere ike isi mmiri dị mma. Ọ dị mmadụ karịa 46 nde na-eme ihe na-adịghị mma n\'ọhịa, nke na-ebute ọrịa mmiri. Gọọmentị etiti na-arụ ọrụ iji jikọọ obodo nke ọma na usoro isi mmiri ọhụụ. Ọrụ CLTS na-enyere obodo aka n\'ịgbanwe omume ọjọọ banyere nlọchapụ ihe njọ.',
    target_audience: 'community', is_published: true, views: 192,
    tags: ['water', 'health', 'sustainability', 'nigeria'],
    student_actions: ['Nwaa mmiri n\'ụlọ akwụkwọ gị iji hụ ma ọ dị ọcha', 'Kọọ ebe ndị mmadụ na-ekuke ihe njọ n\'ìhè ìhè'],
    examples: ['RUWASSA nke Ekiti State na-ewu ọdọ mmiri 200 n\'obodo', 'Ọrụ CLTS UNICEF kwadoro na Kano pụchara obodo 500 n\'ịkuke ihe njọ n\'ìhè ìhè'],
    club_activity: 'Mepụta poster banyere iji mmiri ọcha na nlọchapụ ihe njọ ọma',
    read_time: 4, media_url: 'https://media.sdg-nigeria.org/sdg6/mmiri-audio-igbo.mp3',
  },
  {
    sdg_number: 6, language: 'yo', content_type: 'quiz',
    title: 'Ìdánwò Lórí Omi Mímọ́ àti Ìmọ̀tọ́tọ́',
    body: 'Ìdánwò yìí ń ṣàyẹ̀wò ìmọ̀ àwọn akẹ́kọ̀ọ́ lórí omi mímọ́ àti ìmọ̀tọ́tọ́ ní Nàìjíríà. Ó fẹ́rẹ̀ẹ́ jẹ́ ìdajì àwọn ará Nàìjíríà kò ní ànfààní sí omi amúṣàn tó pé. Àìmọ́tọ́tọ́ jẹ́ ọ̀kan lára àwọn ohun tó fa àwọn àìsàn tó ń pa ọ̀pọ̀ ará Nàìjíríà lọ́dọọdún. Ètò CLTS ń ṣèrànwọ́ fún àwọn àdùgbò láti yí ìwà wọn padà. Ìdánwò yìí yóò ṣèrànwọ́ fún àwọn akẹ́kọ̀ọ́ láti mọ àwọn ìpèníjà wọ̀nyí.',
    target_audience: 'students', is_published: true, views: 267,
    tags: ['water', 'health', 'education', 'nigeria'],
    student_actions: ['Dahun àwọn ìbéèrè ìdánwò náà', 'Pín àwọn ohun tí o kọ́ pẹ̀lú ẹbí rẹ'],
    examples: ['Ètò omi mímọ́ RUWASSA ní Ìpínlẹ̀ Èkìtì', 'UNICEF CLTS ní Kano tó yọ agbègbè 500 kúrò nínú ìkúkú ní gbangba'],
    club_activity: 'Ṣe ìdánwò omi ní ilé ẹ̀kọ́ tàbí àdùgbò rẹ pẹ̀lú kíìtì rírọrùn',
    read_time: 3, media_url: 'https://media.sdg-nigeria.org/sdg6/omi-quiz-yoruba.json',
  },

  // ── SDG 7 · Affordable Energy ────────────────────────────────
  {
    sdg_number: 7, language: 'en', content_type: 'video',
    title: "Nigeria's Energy Crisis and Renewable Solutions",
    body: 'Nigeria generates only about 4,000 MW of electricity for a population of over 220 million, resulting in frequent blackouts that cost the economy an estimated $29 billion annually. The Electricity Act 2023 liberalised the sector, allowing state governments and private entities to generate and distribute power independently. Solar energy adoption is accelerating, with off-grid solar systems now providing electricity to over 5 million rural households through the REA Solar Home Systems programme. The Nigeria Electrification Project (NEP) targets 25 million people with clean energy access by 2030. Biogas from agricultural waste is an underutilised resource that could power thousands of rural homes and processing facilities.',
    target_audience: 'government', is_published: true, views: 467,
    tags: ['energy', 'innovation', 'sustainability', 'nigeria'],
    student_actions: ["Calculate your school's electricity consumption per day", 'Design a simple solar-powered device model using basic materials'],
    examples: ['REA Solar Home Systems programme reaching 5 million rural households', 'Bauchi State mini-grid project powering 12 communities with solar energy'],
    club_activity: 'Build a simple solar oven from cardboard and foil to demonstrate renewable energy',
    read_time: 6, media_url: 'https://media.sdg-nigeria.org/sdg7/energy-crisis-solutions.mp4',
  },
  {
    sdg_number: 7, language: 'ha', content_type: 'infographic',
    title: 'Makamashi Mai Arha da Mai Dorewa',
    body: "Najeriya tana samar da wutar lantarki kaɗan kwarai ga yawan jama'arta. Yawancin gidaje ba sa samun wutar lantarki daga grid na ƙasa. Hasken rana yana bayar da madadin wutar lantarki mai dorewa ga miliyoyin gidaje a yankunan karkara. Shirin REA na Solar Home Systems yana taimaka wa gidaje marasa isa ga grid na ƙasa. Dokar Lantarki ta 2023 ta ba jihohi da masu zaman kansu damar samar da wutar lantarki.",
    target_audience: 'community', is_published: true, views: 214,
    tags: ['energy', 'sustainability', 'nigeria', 'innovation'],
    student_actions: ['Lissafta yadda wutar lantarki take amfani a makaranta kowane yini', 'Tsara samfuri mai amfani da hasken rana'],
    examples: ['Shirin REA Solar Home Systems mai kaiwa gidaje miliyan 5', 'Aikin mini-grid na Bauchi da ke ba ƙauyuka 12 wutar lantarki'],
    club_activity: 'Gina tanderun solar mai sauƙi daga kayan gida',
    read_time: 4, media_url: 'https://media.sdg-nigeria.org/sdg7/makamashi-infographic-hausa.png',
  },
  {
    sdg_number: 7, language: 'ig', content_type: 'text',
    title: 'Ọkụ Eletrik na Naịjịrịa: Nsogbu na Ngwọta',
    body: 'Naịjịrịa na-emepụta naanị megawatt 4,000 nke ọkụ eletrik maka ndị mmadụ karịa 220 nde, ihe a na-ebute ọchịchọ dị ukwuu. Ihe mfu nke ọkụ eletrik na akụ na ụba Naịjịrịa bụ ihe dị ka $29 ijeri n\'afọ. Ọkụ anyanwụ bụ ọzọ ọzọ dị mma na-abawanye n\'obodo ndị dị na mba n\'ihi ọrụ dị ka Solar Home Systems nke REA. Iwu ọkụ eletrik 2023 kwere ike steeti na ndị ọrụ nọ n\'ozuzu ịmepụta ọkụ eletrik onwe ha. Naịjịrịa nwere ike ikwọ ihe mkpa nke ọkụ eletrik ya site n\'iji ọkụ anyanwụ na ikuku.',
    target_audience: 'students', is_published: true, views: 333,
    tags: ['energy', 'innovation', 'nigeria', 'sustainability'],
    student_actions: ['Gbakọọ ọkụ eletrik ụlọ akwụkwọ gị na-eji n\'ụbọchị', 'Mee ihe ihe ọhụụ nke ọkụ anyanwụ na-achị ya site n\'ihe dị mfe'],
    examples: ['Ọrụ REA Solar Home Systems na-enye gidaje 5 nde ọkụ', 'Ọrụ mini-grid nke Bauchi State na-enye obodo 12 ọkụ eletrik'],
    club_activity: 'Wuo oven solar nke dị mfe site n\'ihe osi osisi na ihe nchara',
    read_time: 5, media_url: 'https://media.sdg-nigeria.org/sdg7/oku-eletrik-igbo.pdf',
  },

  // ── SDG 8 · Decent Work ──────────────────────────────────────
  {
    sdg_number: 8, language: 'en', content_type: 'text',
    title: 'Youth Unemployment and Economic Growth in Nigeria',
    body: "Nigeria's unemployment rate reached 33.3% in 2021, with youth unemployment significantly higher at nearly 53%, representing one of the most acute youth employment crises globally. The informal sector absorbs approximately 80% of Nigeria's workforce, often without social protection, fair wages, or safe working conditions. Federal interventions including the N-Power programme, YouWin Connect, and the MSME Survival Fund have reached millions of young Nigerians with skills training and grants. The AfCFTA presents an opportunity for Nigerian businesses to access a $3.4 trillion continental market. Digitally-driven sectors including fintech, e-commerce, and creative industries are generating employment for tech-savvy youth.",
    target_audience: 'donor', is_published: true, views: 589,
    tags: ['innovation', 'nigeria', 'youth', 'poverty'],
    student_actions: ['Identify three growing sectors in Nigeria that could offer you employment', 'Research the requirements for starting a small business in your state'],
    examples: ['N-Power reaching 500,000 young graduates with stipends and training', 'Lagos tech ecosystem generating 30,000 fintech jobs in 2023'],
    club_activity: 'Host a mock job fair where students pitch business ideas to a panel',
    read_time: 6, media_url: 'https://media.sdg-nigeria.org/sdg8/youth-unemployment.pdf',
  },
  {
    sdg_number: 8, language: 'yo', content_type: 'audio',
    title: 'Iṣẹ́ àti Ìdàgbàsókè Ètò Ọrọ̀ Ajé',
    body: 'Àìríiṣẹ́ jẹ́ ọ̀kan lára àwọn ìpèníjà tó tóbi jùlọ tí àwọn ọ̀dọ́ Nàìjíríà ń kojú. Ó fẹ́rẹ̀ẹ̀ jẹ́ ìdajì àwọn ọ̀dọ́ ní Nàìjíríà kò ní iṣẹ́ tó péye. Ètò N-Power ti rọ̀ mọ́ àwọn ọ̀dọ́ mílíọ̀nù mẹ́ẹ̀dọ́gbọ̀n pẹ̀lú àwọn ìkọ́ iṣẹ́ àti owó ìṣẹ́. Àwùjọ ìmọ̀-ẹ̀rọ Làgos ń pèsè iṣẹ́ tuntun nínú àwọn apá bí fintech àti ìṣòwò ẹ̀rọ. AfCFTA ti ṣí ọ̀nà fún àwọn oníṣòwò Nàìjíríà láti wọ ọjà ìgbàkejì Áfríkà.',
    target_audience: 'students', is_published: true, views: 352,
    tags: ['innovation', 'nigeria', 'youth', 'education'],
    student_actions: ['Wá àwọn ètò mẹ́ta tó ń dàgbà ní Nàìjíríà tó lè fún ọ ní iṣẹ́', 'Ṣe ìwádìí lórí bí a ṣe ń bẹ̀rẹ̀ iṣẹ́ kékeré ní ìpínlẹ̀ rẹ'],
    examples: ['N-Power tó ti fọwọ́ kàn àwọn ọ̀dọ́ ìpínlẹ̀ Ọ̀yọ́ 50,000', 'Àwọn iṣẹ́ fintech Lagos tó ń pèsè iṣẹ́ 30,000 ní ọdún 2023'],
    club_activity: 'Ṣètò àpèjọ iṣẹ́ ètò níbi tí àwọn akẹ́kọ̀ọ́ yóò ṣàfihàn àwọn ètò iṣẹ́',
    read_time: 5, media_url: 'https://media.sdg-nigeria.org/sdg8/ise-audio-yoruba.mp3',
  },
  {
    sdg_number: 8, language: 'ha', content_type: 'video',
    title: 'Aiki Mai Mutunci da Ci Gaban Tattalin Arziki',
    body: "Rashin aikin yi yana daya daga cikin manyan ƙalubalen da matasan Najeriya ke fuskanta, inda ƙididdiga ta nuna kashi 53% na matasa ba sa da aiki. Tattalin arzikin yau da kullum yana ɗaukar kashi 80% na ma'aikata ba tare da kariya ta zamantakewar jama'a ba. Shirin N-Power ya taimaka wa matasa miliyan 0.5 ta hanyar horo da tallafi. Harkar fasahar dijital da fintech na ƙara bude sabbin hanyoyin samun kuɗi ga matasa. AfCFTA na bude kofa ga yan kasuwan Najeriya su shiga kasuwar nahiyar Afirka ta dala tiriliyan 3.4.",
    target_audience: 'youth', is_published: true, views: 412,
    tags: ['innovation', 'nigeria', 'youth', 'poverty'],
    student_actions: ['Gano sassan tattalin arzikin da ke girma a Najeriya', "Yi bincike kan yadda ake kafa ƙananan masana'antu"],
    examples: ['N-Power ya kai matasa 500,000 da tallafi da horo', 'Masana\'antu ta fasaha a Lagos na bude ayyukan yi 30,000'],
    club_activity: 'Shirya baje kolin ayyukan yi a makaranta inda ɗalibai za su gabatar da ra\'ayoyin kasuwanci',
    read_time: 5, media_url: 'https://media.sdg-nigeria.org/sdg8/aiki-video-hausa.mp4',
  },

  // ── SDG 9 · Industry & Innovation ───────────────────────────
  {
    sdg_number: 9, language: 'en', content_type: 'infographic',
    title: 'Infrastructure Gaps and Innovation in Nigeria',
    body: "Nigeria's infrastructure deficit is estimated at $3 trillion over 30 years by the African Development Bank, covering roads, bridges, rail, and broadband connectivity. Only 17% of Nigerian roads are paved, and rail connectivity remains extremely limited outside a few major corridors. The National Broadband Plan targets 70% broadband penetration by 2025, critical for enabling a digital economy. Nigeria's technology startup ecosystem raised over $1.5 billion in venture capital in 2021, driven by hubs in Lagos, Abuja, and Port Harcourt. Industrial clusters in Ogun, Kano, and Aba are key anchors for manufacturing sector growth.",
    target_audience: 'donor', is_published: true, views: 478,
    tags: ['innovation', 'nigeria', 'sustainability', 'governance'],
    student_actions: ['Document the infrastructure challenges in your LGA', 'Research one Nigerian tech startup and its social impact'],
    examples: ['Andela training 100,000 African software engineers including Nigerians', 'Lagos-Ibadan railway reducing journey time and freight costs significantly'],
    club_activity: 'Challenge students to design an innovative solution to a local infrastructure problem',
    read_time: 5, media_url: 'https://media.sdg-nigeria.org/sdg9/infrastructure-innovation.png',
  },
  {
    sdg_number: 9, language: 'ig', content_type: 'video',
    title: 'Ihe Ọhụụ na Mmepụta Ihe na Naịjịrịa',
    body: 'Naịjịrịa nwere enweghị ihe zuru oke nke ụzọ, ihe ọkụ eletrik, na nchekwa mmiri, nke na-egbochi mmepe ya. Naanị pasent 17 nke ụzọ Naịjịrịa bụ ndị a haziri nke ọma. Usoro broadband nke mba na-arịọ ka pasent 70 nke ndị mmadụ nwee internet ka 2025. Ọrụ IT startup Naịjịrịa were ihe dị ka $1.5 ijeri n\'ntụlite isi maka ọrụ n\'afọ 2021. Ndị ụlọ ọrụ na-arụ ọrụ na Ogun, Kano, na Aba bụ isi iyi nke ụlọ ọrụ mmepụta ihe n\'Naịjịrịa.',
    target_audience: 'students', is_published: true, views: 307,
    tags: ['innovation', 'nigeria', 'education', 'sustainability'],
    student_actions: ['Dee nsogbu ọkọlọtọ dị n\'obodo gị', 'Nyocha ọrụ ihe ọhụụ startup otu nke Naịjịrịa na mmetụta ya n\'ọha mmadụ'],
    examples: ['Andela nke na-azụ ndị ọrụ software karịa 100,000 n\'Afrịka', 'Ụzọ igwe ọla Lagos-Ibadan na-ebelata oge njem na ụgwọ ibu'],
    club_activity: 'Jụọ ụmụ akwụkwọ ka ha chepụta ngwọta ihe ọhụụ maka nsogbu ọkọlọtọ dị n\'obodo',
    read_time: 5, media_url: 'https://media.sdg-nigeria.org/sdg9/ihe-ohuu-video-igbo.mp4',
  },
  {
    sdg_number: 9, language: 'yo', content_type: 'pdf',
    title: 'Ìmọ̀-Ẹ̀rọ àti Ìdàgbàsókè Ilé-Iṣẹ́ ní Nàìjíríà',
    body: 'Àìpéye ti àwọn ìpìlẹ̀ àmúṣọnà Nàìjíríà jẹ́ ìdènà pàtàkì fún ìdàgbàsókè ètò ọrọ̀ ajé. Ìmọ̀-ẹ̀rọ dijitì àti àwọn ilé iṣẹ́ fintech ń mú ìyípadà wá fún àwọn ọ̀dọ́ tó ń wá ojú iṣẹ́. Ìlú Làgos jẹ́ ọ̀kan lára àwọn àárọ̀ ìmọ̀-ẹ̀rọ tó ń dàgbà yára jùlọ ní Áfríkà. Àwọn ibùdó ìṣẹ̀dá bí Co-Creation Hub ní Làgos àti Àbújá ń tètè gbé àwọn ìmọ̀-ẹ̀rọ tuntun dìde. Ètò broadband orílẹ̀-èdè fẹ́ mú ìgbà àárọ̀ sí internet dé ìdá 70% ti àwọn ará Nàìjíríà lọ́dún 2025.',
    target_audience: 'ngo', is_published: true, views: 256,
    tags: ['innovation', 'nigeria', 'governance', 'youth'],
    student_actions: ['Ṣe ìwádìí lórí ọ̀kan nínú àwọn ibùdó ìmọ̀-ẹ̀rọ ní Nàìjíríà', 'Kọ ìtàn kan nípa oníṣòwò ìmọ̀-ẹ̀rọ ọ̀dọ́ ní Nàìjíríà'],
    examples: ['Co-Creation Hub Làgos tó ti ṣèrànwọ́ fún àwọn startup 150+', 'Ìpèsè ẹ̀rọ gbóná jíjí (broadband) tó ti fẹ̀ sí i ní àwọn ìpínlẹ̀ mẹ́fà'],
    club_activity: 'Ṣètò ìdíje ìmọ̀-ẹ̀rọ níbi tí àwọn akẹ́kọ̀ọ́ yóò ṣàfihàn àwọn ọgbọ́n tuntun',
    read_time: 5, media_url: 'https://media.sdg-nigeria.org/sdg9/imo-ero-pdf-yoruba.pdf',
  },

  // ── SDG 10 · Reduced Inequalities ───────────────────────────
  {
    sdg_number: 10, language: 'en', content_type: 'text',
    title: 'Inequality in Nigeria: Regional and Social Dimensions',
    body: "Nigeria's Gini coefficient stands at approximately 0.43, indicating significant income inequality that has persisted despite economic growth. The gap between the richest and poorest states is stark — Lagos's GDP per capita is over 10 times that of Yobe. Ethnic and religious marginalisation continues to fuel tensions in the Middle Belt and Delta regions. The National Social Investment Programme (NSIP) attempts to address inequality through cash transfers, school feeding, and employment interventions. Disability inclusion remains poor, with less than 3% of persons with disabilities participating in formal employment.",
    target_audience: 'ngo', is_published: true, views: 401,
    tags: ['equality', 'nigeria', 'governance', 'poverty'],
    student_actions: ['Compare GDP and poverty data for two Nigerian states', 'Research one programme targeting marginalised groups in Nigeria'],
    examples: ['NSIP HomeCare programme employing 10,000 persons with disabilities', 'Niger Delta Development Commission investing in youth skills in oil-producing communities'],
    club_activity: 'Discuss in groups: what does inequality feel like and how can communities address it?',
    read_time: 6, media_url: 'https://media.sdg-nigeria.org/sdg10/inequality-nigeria.pdf',
  },
  {
    sdg_number: 10, language: 'ha', content_type: 'infographic',
    title: 'Rashin Daidaito a Najeriya',
    body: "Rashin daidaito a Najeriya yana bayyana a sarari tsakanin jihohi masu arziki kamar Lagos da kuma jihohin arewa masu talauci. Yawan samun kuɗi ba daidai yake ba a tsakanin yankuna daban-daban na ƙasar. Shirin NSIP na gwamnatin tarayya yana ƙoƙarin magance rashin daidaito ta hanyar tallafin kuɗi kai tsaye. Mutanen da ke da nakasa suna fuskantar ƙalubale na musamman a kasuwar aiki. Haɓɓaka zuba jari a yankuna marasa ci gaban yana da muhimmanci wajen rage rashin daidaito.",
    target_audience: 'community', is_published: true, views: 189,
    tags: ['equality', 'nigeria', 'governance', 'poverty'],
    student_actions: ['Kwatanta bayanai na GDP da talauci na jihohi biyu', 'Yi bincike kan shirin ɗaya da ke taimaka wa ƙungiyoyin da aka ware'],
    examples: ['Shirin NSIP HomeCare mai daukar nakasassu 10,000', 'Hukumar NDDC ta zuba jari a fasaha a ƙauyen Niger Delta'],
    club_activity: 'Yi tattaunawa a rukuni: me rashin daidaito yake nufi kuma yadda al\'umma za su magance shi',
    read_time: 4, media_url: 'https://media.sdg-nigeria.org/sdg10/rashin-daidaito-hausa.png',
  },
  {
    sdg_number: 10, language: 'yo', content_type: 'quiz',
    title: 'Ìdánwò Lórí Àìdọ́gba Nínú Àwùjọ',
    body: "Ìdánwò yìí yóò ṣàyẹ̀wò ìmọ̀ rẹ lórí àìdọ́gba tó wà nínú àwùjọ Nàìjíríà. Àìdọ́gba àwọn ìpínlẹ̀ ní Nàìjíríà jẹ́ ohun tó ṣe kedere púpọ̀ — GDP àwọn ìpínlẹ̀ bí Làgos àti Yobe ní ìyàtọ̀ tó tóbi. Ètò NSIP ń gbìyànjú láti mú ìdọ́gba wá nípasẹ̀ àwọn ètò ìrànwọ́ kùnà. Àwọn ìdánwò wọ̀nyí yóò ṣèrànwọ́ fún àwọn akẹ́kọ̀ọ́ láti mọ àwọn ìpèníjà wọ̀nyí nínú àwùjọ wọn.",
    target_audience: 'students', is_published: true, views: 223,
    tags: ['equality', 'nigeria', 'education', 'governance'],
    student_actions: ['Dahun àwọn ìbéèrè ìdánwò lórí àìdọ́gba', 'Gbé àwọn àbájáde ìdánwò wé pẹ̀lú àwọn ẹlẹgbẹ́ rẹ'],
    examples: ['Ètò NSIP tó ti tọ́jú àwọn ènìyàn 10,000 tó ní àìlera', 'NDDC tó ń dáná àwọn ọ̀dọ́ ní àgbègbè Niger Delta'],
    club_activity: 'Jíròrò nínú ẹgbẹ́: kí ni àìdọ́gba túmọ̀ sí àti bí àwùjọ ṣe lè dojú kọ rẹ̀?',
    read_time: 3, media_url: 'https://media.sdg-nigeria.org/sdg10/idogba-quiz-yoruba.json',
  },

  // ── SDG 11 · Sustainable Cities ─────────────────────────────
  {
    sdg_number: 11, language: 'en', content_type: 'pdf',
    title: 'Urban Growth and Sustainable Cities in Nigeria',
    body: "Nigeria is one of the fastest urbanising countries in the world, with Lagos projected to become the world's largest city by 2100. Over 60% of urban Nigerians live in informal settlements lacking basic services, creating pressure on transportation, waste management, and water supply. The National Urban Development Policy provides a framework for managed urbanisation and inclusive city planning. The Lagos Bus Rapid Transit (BRT) system serves over 200,000 daily commuters, reducing congestion and emissions. Abuja's urban masterplan, though imperfectly implemented, offers lessons for satellite city planning across Nigeria.",
    target_audience: 'government', is_published: true, views: 344,
    tags: ['sustainability', 'nigeria', 'innovation', 'governance'],
    student_actions: ['Survey transport and waste challenges in your neighbourhood', 'Design a sketch of a sustainable city block with green spaces and clean transport'],
    examples: ["Lagos BRT serving 200,000 commuters and cutting journey times by 40%", "Kigali's Masterplan offering a model for Nigerian cities to adopt"],
    club_activity: 'Design a model sustainable neighbourhood using recycled materials',
    read_time: 6, media_url: 'https://media.sdg-nigeria.org/sdg11/sustainable-cities-nigeria.pdf',
  },
  {
    sdg_number: 11, language: 'ig', content_type: 'text',
    title: 'Obodo Na-eto eto na Mmepe Dị Nsonaazụ na Naịjịrịa',
    body: 'Naịjịrịa bụ otu n\'ime mba ndị obodo na-eto eto n\'oge ya nke ọma n\'ụwa. Lagos bụ obodo kachasị eto eto na Afrịka, na ndị mmadụ iche iche na-abịa ya n\'oge niile. Ihe karịa pasent 60 nke ndị mmadụ na-ebi n\'obodo Naịjịrịa na-ebi n\'ebe obibi ndị na-enweghị usoro. Lagos BRT na-enyere ndị njem 200,000 n\'ụbọchị, na-ebelata oge njem n\'ụzọ dị mma. Ọrụ mmepụta ihe mmiri na-eri ihe nchefu (recycling) bụ ihe dị mkpa maka obodo dị mma n\'ọchichi.',
    target_audience: 'community', is_published: true, views: 278,
    tags: ['sustainability', 'nigeria', 'governance', 'innovation'],
    student_actions: ['Nyocha nsogbu njem na nchefụ n\'agbata ụlọ gị', 'Dee atụmatụ nke obodo dị mma nwere ọhịa na njem dị ọcha'],
    examples: ['Lagos BRT na-enyere ndị njem 200,000 n\'ụbọchị', 'Atụmatụ mmepe obodo nke Abuja na-enye ihe ọmụma maka obodo ndị ọzọ'],
    club_activity: 'Wuo ụlọ obodo nke na-adị nsonaazụ site n\'ihe a tụgharịrị',
    read_time: 5, media_url: 'https://media.sdg-nigeria.org/sdg11/obodo-igbo.pdf',
  },
  {
    sdg_number: 11, language: 'ha', content_type: 'audio',
    title: 'Birrane Mai Dorewa a Najeriya',
    body: "Najeriya na fama da karuwar yawan jama'a a birranensu cikin sauri, musamman Lagos da Kano da Abuja. Sama da kashi 60% na mazauna birranensu na zaune a wuraren da ba su da isasshen kayayyakin more rayuwa. Tsarin BRT na Lagos yana taimaka wa fasinjoji sama da 200,000 kowace rana wajen gudanar da tafiye-tafiye. Takaddama kan zubar da shara a birranensu babbar matsala ce da ke bukatar magani na gaggawa. Tsarin birnin mai dorewa ya hada da wuraren shakatawa, sufurin jama'a mai inganci, da kayan more rayuwa masu isa ga kowa.",
    target_audience: 'community', is_published: true, views: 195,
    tags: ['sustainability', 'nigeria', 'governance', 'innovation'],
    student_actions: ['Bincika matsalolin sufuri da shara a unguwarku', "Zana hoton unguwa mai dorewa da ke da wuraren shakatawa da sufurin jama'a mai tsafta"],
    examples: ['Lagos BRT mai hidimar fasinjoji 200,000 a rana', 'Tsarin masterplan na Abuja da ke bayar da darussa ga sauran birranensu'],
    club_activity: 'Gina ƙirar unguwa mai dorewa da kayan sake amfani',
    read_time: 4, media_url: 'https://media.sdg-nigeria.org/sdg11/birrane-audio-hausa.mp3',
  },

  // ── SDG 12 · Responsible Consumption ────────────────────────
  {
    sdg_number: 12, language: 'en', content_type: 'video',
    title: 'Waste Management and Circular Economy in Nigeria',
    body: 'Nigeria generates over 32 million tonnes of solid waste annually, with less than 20% properly collected and even less recycled or treated. Electronic waste is a growing problem, with e-waste dumpsites appearing in major cities as discarded phones and laptops accumulate. The Federal Government\'s National Environmental Standards and Regulations Enforcement Agency (NESREA) is responsible for enforcing waste management standards. Several Nigerian startups including Wecyclers and RecyclePoints are building reverse logistics systems to collect and process recyclable materials. Moving toward a circular economy — where waste is treated as a resource — is critical for Nigeria\'s sustainable development.',
    target_audience: 'community', is_published: true, views: 419,
    tags: ['sustainability', 'nigeria', 'innovation', 'education'],
    student_actions: ['Audit waste generated in your school in one day', 'Set up a simple recycling station for paper, plastic, and metal in your class'],
    examples: ['Wecyclers Lagos collecting recyclables from 500,000 urban residents', 'RecyclePoints incentivising waste collection through a reward points system'],
    club_activity: 'Organise a school cleanup day and categorise the types of waste collected',
    read_time: 5, media_url: 'https://media.sdg-nigeria.org/sdg12/waste-management.mp4',
  },
  {
    sdg_number: 12, language: 'ha', content_type: 'text',
    title: 'Amfani Da Albarkatun Kasa da Kula da Muhalli',
    body: "Najeriya na samar da tan miliyan 32 na sharar gida a shekara, kuma kashi 20% ne kawai ake tattara su yadda ya kamata. Sharar lantarki (e-waste) matsala ce mai girma a birranensu kamar Lagos da Kano. Hukumar NESREA ce ke da alhakin tilasta bin ka'idojin kula da shara a duk fadin ƙasar. Kamfanoni matasa kamar Wecyclers da RecyclePoints suna gina tsarin tattara kayayyakin da za a sake amfani da su. Tattalin arzikin da ake sake amfani da kayan a cikin sa yana da mahimmanci wajen rage sharar da gurbacewar muhalli.",
    target_audience: 'students', is_published: true, views: 263,
    tags: ['sustainability', 'nigeria', 'education', 'innovation'],
    student_actions: ['Bincika yawan shara da ake samarwa a makaranta a rana ɗaya', 'Kafa ƙaramar tashar sake amfani da kayaye a ajin ku'],
    examples: ['Wecyclers Lagos tana tattara kayayyakin sake amfani daga mazauna 500,000', 'RecyclePoints yana ƙarfafa tattara shara ta hanyar tsarin ladan maki'],
    club_activity: 'Shirya ranar tsaftace makaranta da rarrabe nau\'ikan sharar da aka tattara',
    read_time: 5, media_url: 'https://media.sdg-nigeria.org/sdg12/amfani-hausa.pdf',
  },
  {
    sdg_number: 12, language: 'ig', content_type: 'infographic',
    title: 'Iji Ihe Na-adịghị Efu Mma na Naịjịrịa',
    body: 'Naịjịrịa na-emepụta ihe karịa tọn miliọn 32 nke ihe nchefu n\'afọ, ma naanị pasent 20 ka e si ezigharị n\'ụzọ kwesịrị ekwesị. Ihe nchefu eletrọnik (e-waste) bụ nsogbu na-abawanye n\'obodo ndị na-eto eto. NESREA bụ ụlọ ọrụ gọọmentị etiti nke na-anọchi anya usoro njikwa ihe nchefu. Ụlọ ọrụ ihe ọhụụ dị ka Wecyclers na RecyclePoints na-ewu usoro nchịkọta ihe enwere ike isi ọzọ. Akụ na ụba gburugburu (circular economy) bụ ihe dị mkpa maka mmepe dị nsonaazụ Naịjịrịa.',
    target_audience: 'teachers', is_published: true, views: 191,
    tags: ['sustainability', 'nigeria', 'innovation', 'education'],
    student_actions: ['Gbanwee ihe nchefu e mepụtara n\'ụlọ akwụkwọ gị n\'otu ụbọchị', 'Tọọ ọdụ ihe isi ọzọ maka ụdanụ, ihe mmiri, na ígwé n\'klasi gị'],
    examples: ['Wecyclers Lagos na-anakọta ihe isi ọzọ n\'aka ndị bi 500,000', 'RecyclePoints na-akwalite nchịkọta ihe nchefu site n\'usoro ịkpọlite ndị mmadụ'],
    club_activity: 'Hazite ụbọchị ịsa ụlọ akwụkwọ ma kọwaa ụdị ihe nchefu e chịkọtara',
    read_time: 4, media_url: 'https://media.sdg-nigeria.org/sdg12/ihe-nchefu-infographic-igbo.png',
  },

  // ── SDG 13 · Climate Action ──────────────────────────────────
  {
    sdg_number: 13, language: 'en', content_type: 'pdf',
    title: "Climate Change Impacts and Nigeria's Response",
    body: 'Nigeria is highly vulnerable to climate change, experiencing worsening droughts in the north, desertification in the Lake Chad basin, coastal erosion in the south, and increasingly severe flooding across the country. The 2022 floods were among the worst in Nigerian history, affecting over 1.3 million people and destroying farmland, infrastructure, and homes. Nigeria\'s Nationally Determined Contribution (NDC) commits to unconditionally reducing greenhouse gas emissions by 20% below business-as-usual by 2030. The Great Green Wall initiative aims to restore 100 million hectares of degraded land across the Sahel, including in northern Nigeria. Climate change adaptation planning must be integrated into all levels of government policy and community practice.',
    target_audience: 'government', is_published: true, views: 563,
    tags: ['sustainability', 'nigeria', 'governance', 'climate'],
    student_actions: ['Track weather patterns in your area over 4 weeks and record changes', 'Research how flooding affected your state in 2022'],
    examples: ['Great Green Wall initiative planting trees in Kebbi and Sokoto States', 'Nigeria NDC committing to 20% GHG reduction below business-as-usual by 2030'],
    club_activity: 'Plant native trees in your school compound and monitor their growth',
    read_time: 7, media_url: 'https://media.sdg-nigeria.org/sdg13/climate-change-nigeria.pdf',
  },
  {
    sdg_number: 13, language: 'yo', content_type: 'infographic',
    title: 'Ìyípadà Ojú Ọjọ́ àti Àwọn Ìpèníjà Rẹ̀ ní Nàìjíríà',
    body: 'Ìyípadà ojú ọjọ́ jẹ́ ìhalẹ̀ tó tóbi fún Nàìjíríà, pẹ̀lú àwọn àmọ̀ tó ń pọ̀ sí i ní àríwá, ìbàjẹ́ etíkun ní gúúsù, àti àwọn ìkún-omi ńlá tó ń sàfojúsùn agbègbè púpọ̀. Ìkún-omi 2022 jẹ́ ọ̀kan nínú àwọn tó burú jùlọ ní Nàìjíríà, tó kan àwọn ènìyàn mílíọ̀nù 1.3. Ìmọ̀ nípa bí a ṣe lè dènà àti bóróbo ìyípadà ojú ọjọ́ jẹ́ dandan fún àwọn akẹ́kọ̀ọ́ gbogbo. Ìpolongo Great Green Wall ń gbìyànjú láti tún àwọn igbó àti ilẹ̀ tó ti bàjẹ́ padà. Gbogbo ipele ìjọba àti àwùjọ gbọdọ̀ kópa nínú ìgbèjà ojú ọjọ́.',
    target_audience: 'students', is_published: true, views: 388,
    tags: ['climate', 'sustainability', 'nigeria', 'education'],
    student_actions: ['Ṣe àkọsílẹ̀ ìyípadà ojú ọjọ́ ní àgbègbè rẹ fún ọ̀sẹ̀ mẹ́rin', 'Ṣe ìwádìí lórí bí ìkún-omi 2022 ṣe kan ìpínlẹ̀ rẹ'],
    examples: ['Ìpolongo Great Green Wall tó ń gbìn igi ní Kebbi àti Sokoto', 'Nigeria NDC tó ń ṣèlérí ìdínwọ̀ 20% nínú àwọn gaasi aféfé tó ń bàjẹ́'],
    club_activity: 'Gbìn àwọn igi abínibí ní ilé ẹ̀kọ́ rẹ kí o sì ṣàkọsílẹ̀ ìdàgbàsókè wọn',
    read_time: 4, media_url: 'https://media.sdg-nigeria.org/sdg13/iyipada-ojo-infographic-yoruba.png',
  },
  {
    sdg_number: 13, language: 'ha', content_type: 'quiz',
    title: 'Gwajin Ilimin Canjin Yanayi',
    body: 'Gwajin nan zai gwada ilimin ku game da canjin yanayi da tasirin sa a Najeriya. Najeriya tana cikin manyan ƙasashen da ke fama da tasirin canjin yanayi, kamar zubar ruwa mai yawa, zaizayar ƙasa, da kuma bushewar Tafkin Chadi. Shirin Great Green Wall na ƙoƙarin maido da ɗaruruwan miliyoyin hekta na ƙasa da ta lalace a yankin Sahel. Najeriya ta yi alkawari a NDC na rage iskar gas da kashi 20% kafin 2030. Dalibai suna da rawar da suka taka wajen yakar canjin yanayi.',
    target_audience: 'students', is_published: true, views: 311,
    tags: ['climate', 'sustainability', 'nigeria', 'education'],
    student_actions: ['Amsa tambayoyin gwajin kan canjin yanayi', 'Yi tambaya da malaman ku kan hanyoyin da za a iya rage canjin yanayi'],
    examples: ['Great Green Wall ta shuka itatuwa a Kebbi da Sokoto', 'Najeriya NDC tana alkawarin rage iskar gas da kashi 20% kafin 2030'],
    club_activity: 'Shirya gasar gwaji kan ilimin canjin yanayi a tsakanin azuzuwa',
    read_time: 3, media_url: 'https://media.sdg-nigeria.org/sdg13/gwaji-canjin-yanayi-hausa.json',
  },

  // ── SDG 14 · Life Below Water ────────────────────────────────
  {
    sdg_number: 14, language: 'en', content_type: 'text',
    title: 'Marine and Freshwater Ecosystems in Nigeria',
    body: "Nigeria's coastline stretches 853 km along the Atlantic Ocean, encompassing the Niger Delta — one of Africa's most ecologically rich and simultaneously most damaged marine environments. Decades of oil spills from multinational oil company activities have devastated mangrove ecosystems, fish populations, and the livelihoods of coastal communities. The National Oil Spill Detection and Response Agency (NOSDRA) monitors and responds to spills but is chronically underfunded. Lake Chad, once one of Africa's largest freshwater bodies, has shrunk by over 90% due to climate change and agricultural water diversion. Sustainable fisheries management is urgently needed to prevent the collapse of artisanal fishing communities across the Niger Delta and southern Nigeria.",
    target_audience: 'ngo', is_published: true, views: 335,
    tags: ['sustainability', 'nigeria', 'water', 'governance'],
    student_actions: ['Research the environmental impact of oil spills in the Niger Delta', 'Visit a local river or waterway and document the state of the ecosystem'],
    examples: ['NOSDRA monitoring 2,000+ oil spill incidents annually in the Niger Delta', 'Lake Chad Basin Commission implementing transboundary water management'],
    club_activity: 'Carry out a water quality test of a nearby river and present findings to classmates',
    read_time: 6, media_url: 'https://media.sdg-nigeria.org/sdg14/marine-ecosystems-nigeria.pdf',
  },
  {
    sdg_number: 14, language: 'ig', content_type: 'video',
    title: 'Ndụ N\'ime Mmiri na Naịjịrịa',
    body: 'Ụzọ mmiri ịkụ azụ (coastline) Naịjịrịa na-agbagha kilomita 853 n\'ọnụ Niger Delta, bụ́ nnukwu mpaghara ọmụmụ nke ọhịa mmiri dị ọcha. Ọtụtụ afọ nke ijiji mmanụ nke ụlọ ọrụ mmanụ buru ibu emebi ụzọ mmiri na azụ ndị dị n\'obi. NOSDRA bụ ụlọ ọrụ ndị ọrụ gọọmentị etiti n\'ihu ijiji mmanụ mana ọ nweghị ego ezuru oke. Ọdọ mmiri Chad, otu n\'ime nnukwu ọdọ mmiri echi dị ogologo n\'Afrịka, belatara ihe karịa pasent 90 n\'ihi mgbanwe ihu igwe. Njikwa azụ nke dị nsonaazụ dị mkpa iji gbochie obi ọjọọ nke obodo ndị na-azụ azụ n\'ụzọ ọdịnala.',
    target_audience: 'community', is_published: true, views: 247,
    tags: ['sustainability', 'nigeria', 'water', 'governance'],
    student_actions: ['Nyocha mmetụta ọjọọ nke ijiji mmanụ na Niger Delta', 'Gaa n\'ọhịa mmiri dị nso wee dee ihe ọ dị ka ugbu a'],
    examples: ['NOSDRA na-elele ihe karịa 2,000 ijiji mmanụ n\'afọ na Niger Delta', 'Kọmishọn Niger Delta na-arụ ọrụ njikwa mmiri n\'ọnụ ọgugụ'],
    club_activity: 'Nwaa ọdịdị mmiri dị n\'ọhịa mmiri dị nso wee kọọ ihe ị hụrụ n\'ụlọ akwụkwọ',
    read_time: 5, media_url: 'https://media.sdg-nigeria.org/sdg14/ndu-mmiri-video-igbo.mp4',
  },
  {
    sdg_number: 14, language: 'yo', content_type: 'audio',
    title: 'Ìgbésí Ayé Abẹ Omi ní Nàìjíríà',
    body: 'Etíkun Nàìjíríà ní gígùn 853 km lẹ́gbẹ̀ Òkun Atlantic, tó ń bo Niger Delta — àgbègbè tó gbóná jíjí nínú ẹ̀kọ́ àyíká ṣùgbọ́n tó ti bàjẹ́ jùlọ ní Áfríkà. Àwọn ìdọ̀tí epo tó ti ń wáyé fún ọdún mẹ́wàá ti pa àwọn igbó mangrove run àti àwọn ẹja run. NOSDRA ń tọ́jú àti fèsì sí àwọn ìdọ̀tí epo àmọ́ kò ní owó tó tó. Ẹ̀kọ́ àyíká Tafkin Chadi ti wó lulẹ̀ nítorí ìyípadà ojú ọjọ́ àti agbé. Ìṣàkóso ẹja tó tọ́ jẹ́ pàtàkì fún dídáàbòbò àwọn àwùjọ tó ń gbé nínú ogún ọ̀pọ̀lọpọ̀ àwọn ẹja.',
    target_audience: 'teachers', is_published: true, views: 198,
    tags: ['sustainability', 'nigeria', 'water', 'governance'],
    student_actions: ['Ṣe ìwádìí lórí àwọn ìdọ̀tí epo ní Niger Delta', 'Ṣàbẹ̀wò sí odò tàbí ọ̀nà omi tó wà nítòsí kí o sì ṣàkọsílẹ̀ ipò ayíká rẹ̀'],
    examples: ['NOSDRA tó ń ṣàkọsílẹ̀ àwọn ìṣẹ̀lẹ̀ ìdọ̀tí epo 2,000+ lọ́dọọdún', 'Ìgbìmọ̀ Niger Delta tó ń ṣèrànwọ́ fún ìṣàkóso omi àgbáyé'],
    club_activity: 'Ṣe ìdánwò didara omi ní odò tó wà nítòsí kí o sì ṣàgbékalẹ̀ àwọn ìwádìí rẹ',
    read_time: 5, media_url: 'https://media.sdg-nigeria.org/sdg14/igbesi-omi-audio-yoruba.mp3',
  },

  // ── SDG 15 · Life on Land ────────────────────────────────────
  {
    sdg_number: 15, language: 'en', content_type: 'infographic',
    title: 'Forests, Wildlife and Land Degradation in Nigeria',
    body: 'Nigeria has lost over 96% of its original forest cover due to agricultural expansion, logging, charcoal production, and urban growth, making it one of the highest deforestation rates globally. The Cross River National Park and Gashaka Gumti National Park are among the few remaining intact forest ecosystems, sheltering critically endangered species including Cross River gorillas. Desertification in the north threatens over 35 million people, with the Sahara advancing southward at a rate of 0.6 km per year. Nigeria\'s Forest Policy and the REDD+ Programme provide frameworks for forest conservation and carbon sequestration. Community forest management models in Cross River State offer a replicable model for integrating local livelihoods with conservation goals.',
    target_audience: 'ngo', is_published: true, views: 422,
    tags: ['sustainability', 'nigeria', 'climate', 'governance'],
    student_actions: ['Research the Cross River gorilla and threats to its survival', 'Plant a tree at home or school and document its growth monthly'],
    examples: ['Cross River State community forestry protecting 100,000 hectares of rainforest', 'REDD+ carbon credit programme channelling funds to local forest communities'],
    club_activity: 'Adopt a tree in your school grounds and assign students to care for it',
    read_time: 5, media_url: 'https://media.sdg-nigeria.org/sdg15/forests-wildlife-nigeria.png',
  },
  {
    sdg_number: 15, language: 'ha', content_type: 'video',
    title: 'Dazuzzuka da Namun Daji a Najeriya',
    body: "Najeriya ta rasa sama da kashi 96% na gandun dajinta na asali sakamakon noma da sare itatuwa da kuma ƙaruwar birrane. Gandun dajin Cross River da Gashaka Gumti suna cikin yankunan ƙanƙanta da suka rage waɗanda ke karɓar dabbobi masu hatsarin halaka kamar gorilla na Cross River. Zaizayar ƙasa a arewa tana yin barazana ga mutane sama da miliyan 35. Shirin REDD+ na taimakawa ƙungiyoyin al'umma su kare gandun daji ta hanyar ba su kudaden carbon. Ƙungiyoyin al'umma a Cross River State suna nuna abin koyi wajen haɗa rayuwa da kiyaye muhalli.",
    target_audience: 'community', is_published: true, views: 285,
    tags: ['sustainability', 'nigeria', 'climate', 'governance'],
    student_actions: ['Yi bincike kan gorilla na Cross River da barazanar da ke addabarta', 'Dasa itace a gida ko makaranta ka kuma rubuta girmar sa kowace wata'],
    examples: ["Ƙungiyoyin al'umma Cross River State suna kare hekta 100,000 na gandun daji", 'Shirin carbon credit na REDD+ yana fitar da kuɗi zuwa ƙungiyoyin daji na ƙauyuka'],
    club_activity: 'Ɗauki nauyin itace ɗaya a makaranta ka raba ɗalibai su kula da shi',
    read_time: 5, media_url: 'https://media.sdg-nigeria.org/sdg15/dazuzzuka-video-hausa.mp4',
  },
  {
    sdg_number: 15, language: 'ig', content_type: 'quiz',
    title: 'Ule Maka Ndụ N\'Elu Ala na Naịjịrịa',
    body: 'Ule a bụ maka ihe ị maara gbasara ọhịa na anụ ọhịa na Naịjịrịa. Naịjịrịa fufụọla ihe karịa pasent 96 nke ọhịa ya nke mbụ n\'ihi ọrụ ugbo na ịkụ osisi. Ọhịa Cross River National Park na Gashaka Gumti bụ ebe ole na ole fọdụrụ ọhịa zuru oke, na-echebere anụ ọhịa ndị dị n\'oge ọnwụ dị ka gorilla Cross River. Ọrụ REDD+ na-enyere obodo ndị ọchịchọ aka n\'ịchebe ọhịa site n\'ịkwa ha ego carbon. Usoro njikwa ọhịa nke obodo na Cross River State na-enye ihe atọ ọma maka ịjikọ ndụ ndị mmadụ na nlebe anya ọhịa.',
    target_audience: 'students', is_published: true, views: 208,
    tags: ['sustainability', 'nigeria', 'climate', 'education'],
    student_actions: ['Zaghachi ule a ma ọ bụ nwalee ihe ị maara gbasara ọhịa na anụ ọhịa', 'Kụọ osisi n\'ụlọ ma ọ bụ ụlọ akwụkwọ wee dee ihe banyere uto ya kwa ọnwa'],
    examples: ['Obodo Cross River State na-echebe hekta 100,000 nke ọhịa ozuzo', 'Ọrụ carbon credit REDD+ na-eziga ego gaa n\'obodo ndị na-elekọta ọhịa'],
    club_activity: 'Nata osisi n\'ụlọ akwụkwọ gị wee kee ụmụ akwụkwọ ka ha lekọta ya',
    read_time: 3, media_url: 'https://media.sdg-nigeria.org/sdg15/ule-ohia-igbo.json',
  },

  // ── SDG 16 · Peace & Justice ─────────────────────────────────
  {
    sdg_number: 16, language: 'en', content_type: 'text',
    title: 'Peace, Justice and Governance in Nigeria',
    body: 'Nigeria faces complex security challenges including Boko Haram and ISWAP insurgency in the northeast, banditry and kidnapping in the northwest, and persistent communal conflicts in the Middle Belt. The Independent Corrupt Practices and Other Related Offences Commission (ICPC) and the Economic and Financial Crimes Commission (EFCC) are key institutions combating corruption, which Transparency International consistently ranks as a major governance failure. Access to justice remains elusive for most Nigerians, with an estimated 300,000 awaiting-trial prisoners held in the country\'s overcrowded correctional facilities. The Lagos Multi-Door Courthouse offers an alternative dispute resolution model that has resolved over 5,000 commercial disputes. Youth engagement in civic processes and community policing are critical to building sustainable peace from the ground up.',
    target_audience: 'government', is_published: true, views: 497,
    tags: ['governance', 'nigeria', 'equality', 'education'],
    student_actions: ['Research the role of EFCC in fighting corruption in Nigeria', 'Identify three rights guaranteed to Nigerian citizens under the 1999 Constitution'],
    examples: ['Lagos Multi-Door Courthouse resolving 5,000+ commercial disputes out of court', 'Community policing initiative in Benue State reducing cattle-herder conflicts'],
    club_activity: 'Hold a mock trial on a current affairs issue to understand the justice system',
    read_time: 7, media_url: 'https://media.sdg-nigeria.org/sdg16/peace-justice-governance.pdf',
  },
  {
    sdg_number: 16, language: 'ig', content_type: 'audio',
    title: 'Ụlọ Ọrụ Ike na Ikpe Ziri Ezi na Naịjịrịa',
    body: 'Naịjịrịa na-eche ihe doro anya gbasara ntọala iwu na ọchịchọ, n\'ihi nsogbu nchekwa n\'ugwụ ọwụwa anyanwụ, ọchịchọ na-atọ ụtọ n\'ugwụ ọdịda anyanwụ, na esemokwu obodo n\'etiti Belt. EFCC na ICPC bụ ụlọ ọrụ mkpa na-alụ ọgụ megide ọdachi ọchịchọ n\'Naịjịrịa. Ọdịdị iwu n\'Naịjịrịa bụ nsogbu ukwuu, n\'ihi ọnụ ọgugụ buru ibu nke ndị na-echere nnọọ n\'ụlọ mkpọrọ. Lagos Multi-Door Courthouse gosiri otu esi eme ikpe n\'ụzọ ọzọ pụọ n\'ụlọ ikpe. Ntinye aka nke ndị ọcha n\'usoro ndọrọ ndọrọ ọchịchọ bụ ihe mkpa maka ịwụ udo n\'ụzọ dị nsonaazụ.',
    target_audience: 'community', is_published: true, views: 319,
    tags: ['governance', 'nigeria', 'equality', 'education'],
    student_actions: ['Nyocha ọrụ EFCC n\'ịlụ ọgụ megide ọdachi ọchịchọ na Naịjịrịa', 'Chọpụta ihe atọ ndị nwe Naịjịrịa nwere ikike ha dị n\'Iwu Ntọala 1999'],
    examples: ['Lagos Multi-Door Courthouse doziri esemokwu azụmahịa 5,000+ n\'èzí ụlọ ikpe', 'Ọrụ ọchịchọ obodo na Benue State na-ebelata esemokwu ndị ọzụzụ ehi na ndị ọrụ ugbo'],
    club_activity: 'Mee nnọọ ikpe na okwu ihe mere mere ugbu a iji ghọta usoro ikpe',
    read_time: 6, media_url: 'https://media.sdg-nigeria.org/sdg16/ike-ikpe-audio-igbo.mp3',
  },
  {
    sdg_number: 16, language: 'ha', content_type: 'infographic',
    title: 'Zaman Lafiya da Adalci a Najeriya',
    body: "Najeriya na fama da ƙalubalen tsaro da yawa, da suka haɗa da tashe-tashen hankulan Boko Haram a arewa maso gabas da fashi-bauna a arewa maso yamma. Hukumomin EFCC da ICPC suna da alhakin yaki da cin hanci da rashawa, wanda Transparency International ke ɗauke shi a matsayin babbar matsala ta mulki. Tsarin Mulki na 1999 yana ba kowane ɗan Najeriya hakkokin asasi da ba za a iya karye musu ba. Tsarin sasantawa na Lagos Multi-Door Courthouse ya warware rikice-rikicen kasuwanci sama da 5,000. Shiga matasa a siyasar ƙasa da tsare-tsare na 'yan sanda jama'a na da muhimmanci wajen gina salama mai dorewa.",
    target_audience: 'students', is_published: true, views: 274,
    tags: ['governance', 'nigeria', 'equality', 'education'],
    student_actions: ['Yi bincike kan rawar EFCC wajen yaki da cin hanci da rashawa', "Lissafta 'yancin 'yan Najeriya guda uku da ke cikin Tsarin Mulki na 1999"],
    examples: ['Lagos Multi-Door Courthouse ya warware rikice-rikice 5,000+ a waje da kotu', "Tsare-tsare na 'yan sanda jama'a a Benue sun rage rikicin makiyaya da manoma"],
    club_activity: "Shirya shari'a ta wasan kwaikwayo kan batun labarai na yau don fahimtar tsarin shari'a",
    read_time: 4, media_url: 'https://media.sdg-nigeria.org/sdg16/zaman-lafiya-infographic-hausa.png',
  },

  // ── SDG 17 · Partnerships ────────────────────────────────────
  {
    sdg_number: 17, language: 'en', content_type: 'video',
    title: "Nigeria's Global Partnerships for Sustainable Development",
    body: 'Achieving the SDGs requires unprecedented levels of domestic resource mobilisation and international cooperation. Nigeria receives approximately $3 billion in Official Development Assistance (ODA) annually, channelled through bilateral and multilateral partners. The African Development Bank, World Bank, and IMF have been critical partners in financing Nigeria\'s development budget and structural reforms. Nigeria\'s domestic revenue mobilisation remains weak, with a tax-to-GDP ratio of approximately 6% — one of the lowest in the world. South-South cooperation through ECOWAS and the African Union provides an increasingly important channel for sharing development knowledge, technology, and resources. Private sector and civil society engagement are essential to the successful delivery of the SDG agenda.',
    target_audience: 'government', is_published: true, views: 388,
    tags: ['governance', 'nigeria', 'sustainability', 'innovation'],
    student_actions: ['Research one bilateral development programme between Nigeria and another country', 'Identify three ways your school or community could partner with others for SDG delivery'],
    examples: ['AfDB financing the Lagos-Kano railway modernisation project', 'ECOWAS Regional Integration Programme supporting cross-border trade among member states'],
    club_activity: 'Create a partnership map showing how different organisations work together to address local SDG challenges',
    read_time: 6, media_url: 'https://media.sdg-nigeria.org/sdg17/partnerships-sdgs.mp4',
  },
  {
    sdg_number: 17, language: 'ha', content_type: 'text',
    title: 'Haɗin Gwiwa don Cimma Manufofi',
    body: "Cimma manufofin SDG yana buƙatar haɗin gwiwa mara misaltuwa tsakanin gwamnatoci, kamfanoni masu zaman kansu, da ƙungiyoyin farar hula. Najeriya tana karɓar kusan dala biliyan 3 na taimakon raya ƙasa (ODA) a shekara daga ƙasashen duniya. Bankin Raya Afirka da Bankin Duniya da IMF sun kasance muhimman abokan haɗin gwiwa wajen ba da kuɗin kasafin raya Najeriya. Haɗin gwiwa ta kudu-kudu ta hanyar ECOWAS da Tarayyar Afirka yana ba da hanyar raba ilimi da fasaha tsakanin ƙasashe masu tasowa. Shigar kamfanonin masu zaman kansu da ƙungiyoyin farar hula yana da muhimmanci wajen isar da manufofin SDG.",
    target_audience: 'donor', is_published: true, views: 221,
    tags: ['governance', 'nigeria', 'sustainability', 'innovation'],
    student_actions: ['Yi bincike kan shirin haɗin gwiwa na ci gaba tsakanin Najeriya da wata ƙasa', 'Gano hanyoyi uku da makarankunku ko al\'umma za su iya haɗin gwiwa da wasu don cimma SDGs'],
    examples: ['AfDB ta ba da kuɗin sabunta layin dogo Lagos-Kano', 'Shirin haɗin gwiwar yanki na ECOWAS da ke goyan bayan kasuwanci tsakanin ƙasashe membobi'],
    club_activity: 'Ƙirƙiri taswira ta haɗin gwiwa da ke nuna yadda ƙungiyoyi daban-daban ke haɗin gwiwa wajen magance ƙalubalen SDG a gari',
    read_time: 5, media_url: 'https://media.sdg-nigeria.org/sdg17/hadin-gwiwa-hausa.pdf',
  },
  {
    sdg_number: 17, language: 'yo', content_type: 'quiz',
    title: 'Ìdánwò Lórí Àjọṣepọ̀ fún Ìdàgbàsókè',
    body: 'Ìdánwò yìí yóò ṣàyẹ̀wò ìmọ̀ rẹ lórí àjọṣepọ̀ àgbáyé fún ìdàgbàsókè àtọ̀runwá. Nàìjíríà gba nǹkan bí dọ́là bílíọ̀nù mẹ́ta ní ìrànlọ́wọ́ ìdàgbàsókè lọ́dọọdún. Banki Àríyájọ Áfríkà, Banki Àgbáyé, àti IMF jẹ́ àwọn alábàáṣepọ̀ pàtàkì nínú ìgbékalẹ̀ ètò ọrọ̀ ajé Nàìjíríà. Àjọṣepọ̀ gúúsù-gúúsù nípasẹ̀ ECOWAS ń pèsè ọ̀nà mìíràn fún ìpín ìmọ̀ àti àwọn ohun àmúṣọnà. Ìgbàtí àwọn ètò ìpò àágbàyé bá papọ̀ pẹ̀lú ìṣẹ̀dá àdáni, àwọn SDGs le ṣe é ní ọ̀nà yára jùlọ.',
    target_audience: 'students', is_published: true, views: 186,
    tags: ['governance', 'nigeria', 'sustainability', 'education'],
    student_actions: ['Dahun àwọn ìbéèrè ìdánwò lórí àjọṣepọ̀ àgbáyé', 'Wá àwọn ọ̀nà mẹ́ta tí ilé ẹ̀kọ́ rẹ lè ṣe àjọṣepọ̀ pẹ̀lú àwọn mìíràn fún ìgbèjà SDG'],
    examples: ['AfDB tó ń ṣèrànwọ́ fún ètò mọ̀tò Lagos-Kano', 'ECOWAS tó ń gbìyànjú fún ìṣòwò àárọ̀ tọ̀ sí àwọn orílẹ̀-èdè tó jẹ́ ọmọ ẹgbẹ́'],
    club_activity: 'Ṣẹ̀dá àwòrán àjọṣepọ̀ tó ń fi àwọn ìgbèjà SDG ní àdùgbò rẹ hàn',
    read_time: 3, media_url: 'https://media.sdg-nigeria.org/sdg17/idanwo-ajosepo-yoruba.json',
  },
];

// ─────────────────────────────────────────────────────────────
// SEEDER FUNCTION
// ─────────────────────────────────────────────────────────────
const seedSDGContent = async () => {
  console.log(`\n📚 Seeding SDG content — ${SDG_CONTENT_SEED.length} documents across 17 SDGs…\n`);

  let inserted = 0;
  let skipped  = 0;
  let failed   = 0;

  for (const item of SDG_CONTENT_SEED) {
    try {
      // Resolve ObjectId reference for the `sdg` field
      const sdgDoc = await SDG.findOne({ number: item.sdg_number }).lean();
      if (!sdgDoc) {
        console.warn(`  ⚠️  SDG ${item.sdg_number} not found in DB — run seedSDGs() first. Skipping "${item.title}"`);
        skipped++;
        continue;
      }

      // Idempotency: skip if same title + language already exists for this SDG
      const exists = await Content.findOne({
        sdg_number: item.sdg_number,
        title:      item.title,
        language:   item.language,
      }).lean();

      if (exists) {
        console.log(`  ⏭️  SDG ${item.sdg_number} [${item.language}] "${item.title}" — already exists, skipping.`);
        skipped++;
        continue;
      }

      await Content.create({
        ...item,
        sdg:          sdgDoc._id,
        published_at: item.is_published ? new Date() : undefined,
      });

      console.log(`  ✅  SDG ${item.sdg_number} [${item.language}] ${item.content_type.padEnd(12)} — "${item.title}"`);
      inserted++;

    } catch (err) {
      console.error(`  ❌  SDG ${item.sdg_number} "${item.title}" — ${err.message}`);
      failed++;
    }
  }

  // Bust all SDG caches after seeding
  try {
    const redis = getRedisClient();
    const keys  = await redis.keys('sdg:*');
    if (keys.length) {
      await redis.del(keys);
      console.log(`\n🗑️  Redis cache cleared (${keys.length} keys removed).`);
    }
  } catch (err) {
    console.warn(`\n⚠️  Redis cache clear failed (non-fatal): ${err.message}`);
  }

  console.log('\n─────────────────────────────────────');
  console.log(`✅  Inserted : ${inserted}`);
  console.log(`⏭️  Skipped  : ${skipped}`);
  console.log(`❌  Failed   : ${failed}`);
  console.log('─────────────────────────────────────\n');

  return { total: SDG_CONTENT_SEED.length, inserted, skipped, failed };
};

// ─────────────────────────────────────────────────────────────
// STANDALONE EXECUTION  (node sdgContent.seed.js)
// ─────────────────────────────────────────────────────────────
if (require.main === module) {
  (async () => {
    try {
      await mongoose.connect(process.env.MONGO_URI);
      console.log('🔗 MongoDB connected.');
      await seedSDGContent();
      await mongoose.disconnect();
      console.log('🔌 MongoDB disconnected. Done.');
      process.exit(0);
    } catch (err) {
      console.error('💥 Seed failed:', err);
      process.exit(1);
    }
  })();
}

module.exports = { seedSDGContent, SDG_CONTENT_SEED };