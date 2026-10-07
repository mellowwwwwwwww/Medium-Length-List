import routes from './routes.js';
import { LIST1, LIST2 } from './config.js';

export const store = Vue.reactive({
    dark: JSON.parse(localStorage.getItem('dark')) || false,
    listType: LIST1, // single-list mode: always the first list
    list1: LIST1,
    list2: LIST2,

    toggleDark() {
        this.dark = !this.dark;
        localStorage.setItem('dark', JSON.stringify(this.dark));
    },

    setListType(type) {
        // single-list mode: ignore requests to switch to the second list
        this.listType = LIST1;
        localStorage.setItem('listType', LIST1);
        this.updateTheme(LIST1);
    },

    updateTheme(type) {
        const root = document.documentElement;
        const logo = document.querySelector('header .logo h2');

        if (type === LIST2) {
            root.style.setProperty('--color-primary', '#feb33b');
            root.style.setProperty('--color-primary-level', '#ffd498');

            if (logo && !logo.innerText.includes(LIST2)) logo.innerText = LIST2;
        } else {
            root.style.removeProperty('--color-primary');
            root.style.removeProperty('--color-primary-level');

            if (logo && !logo.innerText.includes(LIST1)) logo.innerText = LIST1;
        }
    }
});

store.updateTheme(store.listType);

const router = VueRouter.createRouter({
    history: VueRouter.createWebHashHistory(),
    routes,
});

router.beforeEach((to, from, next) => {
    const listPrefix = store.listType === LIST2 ? LIST2 : LIST1;
    const listName = "The Piss List";
    let title = `${listPrefix} | ${listName}`;

    if (to.path === '/' || to.params.id) title = `${listPrefix} | ${listName}`;
    else if (to.path === '/leaderboard') title = "Leaderboard | " + listPrefix;
    else if (to.path === '/roulette') title = "Roulette | " + listPrefix;
    else if (to.path === '/admin') title = "Admin Panel | " + listPrefix;
    else if (to.path === '/manage') title = "Management Panel | " + listPrefix;
    else if (to.path === '/packs') title = "Packs | " + listPrefix;

    document.title = title;
    next();
});

const app = Vue.createApp({
    data: () => ({ store }),
    methods: {
        switchList(type) {
            this.store.setListType(type);
        }
    }
});

app.use(router);
app.mount('#app');
