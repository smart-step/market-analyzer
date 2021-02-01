/**
 * Market Analyzer.
 * @author James Grams
 */

const puppeteer = require("puppeteer");
const fs = require("fs");

const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.142 Safari/537.36";
const OUTPUT_FILE = "output.csv";
// always make sure the manufacturer is the first link, as that will have comparisons to
const HOME_DEPOT = {
    name: "Home Depot",
    url: "https://www.homedepot.com/b/Bath-Urinals/KOHLER/N-5yc1vZbzblZ1qh",
    element: ".product-pod",
    model: {
        element: ".product-pod__model",
        regex: "Model# (.*)"
    },
    price: {
        element: ".price-format__main-price",
        divideByHundred: true
    }
}
let HOME_DEPOT_TOTO = JSON.parse(JSON.stringify(HOME_DEPOT));
HOME_DEPOT_TOTO.url = "https://www.homedepot.com/b/Bath-Urinals/TOTO/N-5yc1vZbzblZgy2?NCNI-5";
const COMPANIES = [
    {
        name: "Kohler",
        links: [
            {
                name: "Kohler",
                url: "https://www.us.kohler.com/us/s/_/N-2e8v?Nr=AND(product.language:English,P_market:KPNASite)&Ntt=Urinals",
                element: ".product-panel",
                price: {
                    element: ".product-panel__price"
                },
                model: {
                    element: ".product-panel__sku"
                }
            },
            HOME_DEPOT/*,
            {
                name: "Lowes",
                url: "https://www.lowes.com/search?searchTerm=urinals&refinement=4294927394",
                element: '[data-selector="prd-image-holder"]',
                model: {
                    element: '[data-selector="prd-iteminfo-holder"]',
                    regex: "Model #(.*)",
                    sibling: true
                },
                price: {
                    element: '[data-selector="prd-price-holder"]',
                    sibling: true
                }
            }*/
        ]
    },
    {
        name: "Toto",
        links: [
            {
                name: "Toto",
                url: "https://www.totousa.com/products/commercial#subcategories=10170128115972183709",
                element: ".product-default-list",
                price: {
                    element: ".list-price",
                    regex: "\\$([\\d\.]+)"
                },
                model: {
                    element: ".sku"
                }
            },
            HOME_DEPOT_TOTO
        ]
    }
]

/**
 * Main program
 */
async function main() {

    let browser = await puppeteer.launch({
        headless: true
    });
    let page = await browser.newPage();
    await page.setViewport({width: 1920, height: 1080});
    await page.setUserAgent(USER_AGENT);

    let output = [];
    for( let company of COMPANIES ) {
        output.push([company.name]);
        let columnNames = ["Model"];
        output.push(columnNames);
        let allProducts = [];
        for( let link of company.links ) {
            columnNames.push( link.name + " Price" );
            if( allProducts.length ) columnNames.push( company.links[0].name + "/" + link.name + " Change" );

            console.log("going to " + link.url);
            await page.goto(link.url);
            await page.waitForSelector(link.element);
            await page.waitForSelector(link.model.element);
            await page.waitForSelector(link.price.element);
            console.log("navigation complete");
            let products = await page.evaluate( (link) => {
                let products = document.querySelectorAll( link.element );
                let itemMap = {};

                for( let product of products ) {
                    let modelElement = product;
                    if( link.model.sibling ) while( modelElement.nextElementSibling && !modelElement.matches(link.model.element) ) modelElement = modelElement.nextElementSibling;
                    else modelElement = product.querySelector(link.model.element);
                    let model = modelElement.innerText.trim();
                    try { // if doesn't exist, this regex will fail
                        if( link.model.regex ) model = model.match(new RegExp(link.model.regex))[1];
                    }
                    catch(err) {
                        continue;
                    }

                    let priceElement = product;
                    if( link.price.sibling ) while( priceElement.nextElementSibling && !priceElement.matches(link.price.element) ) priceElement = priceElement.nextElementSibling;
                    else priceElement = product.querySelector(link.price.element);
                    let price = priceElement.innerText.trim();
                    try {
                        if( link.price.regex ) price = price.match(new RegExp(link.price.regex))[1];
                    }
                    catch(err) {
                        continue;
                    }
                    price = Number(price.replace(/[^0-9.-]+/g,""));
                    if( link.price.divideByHundred ) price = price/100;
                    itemMap[model] = price;
                }

                return itemMap;
            }, link );
            allProducts.push( products );
        }
        console.log("finishing up");
        for( let model in allProducts[0] ) {
            let columns = [];
            let foundOne = false;
            for( let products of allProducts.slice(1) ) {
                if(!(model in products)) {
                    columns.push("-","-"); // placeholders if needed
                    continue;
                }
                foundOne = true;
                columns.push( '$' + products[model].toFixed(2) );
                columns.push( Math.round((products[model] - allProducts[0][model])/allProducts[0][model]*100*1000)/1000 + "%" ); // difference
            }
            if( !foundOne ) continue; // no matching items on ANY site, don't include
            // we should still be in the same order as the sites we fetched, which we added to columnNames in the same order
            output.push( [model, '$' + allProducts[0][model].toFixed(2), ...columns] );
        }
    }

    fs.writeFileSync(OUTPUT_FILE, output.map(el => el.join()).join("\n"));
    await browser.close();
    return Promise.resolve();
}

main();