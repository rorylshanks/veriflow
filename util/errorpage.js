import ejs from 'ejs';
import path from 'path';

async function renderErrorPage(status_code, error_code_override) {
    var header = "Internal Server Error"
    var description = "An internal server error occoured. Please try again."
    var error_code = "ERR_INTERNAL_ERROR"
    if (status_code == 404) {
        header = "Resource Not Found"
        description = "The requested resource cannot be found. Please check and try again."
        error_code = "ERR_NOT_FOUND"
    }
    if (status_code == 403) {
        header = "Unauthorized"
        description = "You are not authorized to acces the requested resource."
        error_code = "ERR_NOT_AUTHORIZED"
    }
    if (status_code == 503) {
        header = "Service Unavailable"
        description = "The requested resource is currently not available. Please try again later"
        error_code = "ERR_NOT_AVAIL"
    }
    if (error_code_override) {
        error_code = error_code_override
    }
    var title = `${status_code} ${header}`
    var html = await ejs.renderFile(path.join(process.cwd(), '/views/error_fullpage.ejs'), {
        title,
        header,
        status_code,
        description,
        error_code
    });
    return html
}

export default {
    renderErrorPage
}