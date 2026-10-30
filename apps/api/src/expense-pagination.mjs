export function pagination(query){
 if(query.page===undefined&&query.page_size===undefined)return null;
 const page=String(query.page??'1'),size=String(query.page_size??'25');
 if(!/^[1-9]\d{0,6}$/.test(page)||!['10','25','50','100'].includes(size))throw Error('Use a positive page and page_size of 10, 25, 50 or 100.');
 return {page:Number(page),page_size:Number(size)};
}
